'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';
import { logActivity } from '@/src/activity';
import type { GrantableCapability } from '@/src/capabilities';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';
import { getInstalledPlugins } from '@/src/registry';
import { deleteUser } from '@/src/user-deletion';
import { ACTION_OK, apiErrorMessage, guarded, type ActionResult } from '../_lib/action-result';
import { adminFetch } from '../_lib/admin-fetch';
import { requireCapability } from '../_lib/authz';

/** Plugin options for the invite multi-select (RFC 0065 Task 1.17), excluding chrome plugins that every user already has access to. */
export interface InvitablePluginOption {
  id: string;
  name: string;
}

export async function listInvitablePluginOptions(): Promise<InvitablePluginOption[]> {
  await sdk.auth.requireSession();
  return getInstalledPlugins()
    .filter((p) => !CHROME_PLUGIN_IDS.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));
}

const ASSIGNABLE_ROLES = ['platform:admin', 'platform:auditor', 'platform:user'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

async function actorId(): Promise<string | null> {
  return (await headers()).get('x-sovereign-user-id');
}

/** The user directory lives on the auth server; everything else here is the runtime's own API. */
function authApi(path: string, init?: RequestInit): Promise<Response> {
  return adminFetch(path, { ...init, api: 'auth' });
}

async function sendAdminEmail(input: {
  templateId: string;
  toUserId?: string | null;
  toEmail: string;
  actorUserId?: string | null;
  subject: string;
  text: string;
  html: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await adminFetch('/api/admin/email', {
    method: 'POST',
    body: JSON.stringify({ deliveryClass: 'administrative', source: 'console', ...input }),
  });
  const data = (await res.json().catch(() => null)) as {
    status?: 'skipped' | 'sent' | 'failed';
    errorCode?: string;
    error?: string;
  } | null;
  if (res.ok && data?.status !== 'skipped') return { ok: true };
  return { ok: false, error: data?.errorCode ?? data?.error ?? `email ${res.status}` };
}

/**
 * Every mutation below returns an `ActionResult` instead of throwing — see
 * `_lib/action-result.ts` for why (a thrown server action used to replace
 * the whole Console column with `error.tsx` and a masked message). The
 * capability preamble throws a `CapabilityError`; `guarded()` turns that,
 * and any other throw, into `{ ok: false }`.
 */
export async function changeRoleAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireCapability('role:assign');
    const userId = formData.get('userId') as string;
    const role = formData.get('role');
    // Console assigns the three delegable roles only — never `platform:owner`
    // (there is exactly one owner; promoting a second one would make it
    // un-demotable through this same API) and never an arbitrary string (the
    // auth server used to write whatever arrived here verbatim).
    if (!isAssignableRole(role)) {
      return { ok: false, error: 'Role must be one of: admin, auditor, user.' };
    }
    const res = await authApi(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to change role') };
    const updated = (await res.json()) as { id: string; email: string; role: string };
    void sendAdminEmail({
      templateId: 'console.role_changed',
      toUserId: updated.id,
      toEmail: updated.email,
      actorUserId: session.user.id,
      subject: 'Your Sovereign role changed',
      text: `Your Sovereign role changed to ${role}.`,
      html: `<p>Your Sovereign role changed to <strong>${role}</strong>.</p>`,
      metadata: { role },
    });
    void logActivity({
      actorId: await actorId(),
      actorType: 'user',
      action: 'user.role_changed',
      subjectUserId: userId,
      targetType: 'user',
      targetId: userId,
      visibility: 'user',
      summary: `Role changed to ${role}`,
      metadata: { role },
    });
    revalidatePath('/console/users');
    return ACTION_OK;
  });
}

export async function toggleActiveAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireCapability('user:manage');
    const userId = formData.get('userId') as string;
    const active = formData.get('active') === 'true';
    // Deactivating yourself is a lockout, not a status change — the cookie
    // cache keeps the session alive for a few minutes, then nobody can get
    // back in until another admin intervenes.
    if (userId === session.user.id) {
      return { ok: false, error: 'You cannot change the status of your own account.' };
    }
    const res = await authApi(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    if (!res.ok) {
      return { ok: false, error: await apiErrorMessage(res, 'Failed to update user status') };
    }
    const updated = (await res.json()) as { id: string; email: string };
    void sendAdminEmail({
      templateId: active ? 'console.account_reactivated' : 'console.account_deactivated',
      toUserId: updated.id,
      toEmail: updated.email,
      actorUserId: session.user.id,
      subject: active
        ? 'Your Sovereign account was reactivated'
        : 'Your Sovereign account was deactivated',
      text: active
        ? 'Your Sovereign account was reactivated.'
        : 'Your Sovereign account was deactivated. Contact your instance operator if this was unexpected.',
      html: active
        ? '<p>Your Sovereign account was reactivated.</p>'
        : '<p>Your Sovereign account was deactivated. Contact your instance operator if this was unexpected.</p>',
      metadata: { active },
    });
    void logActivity({
      actorId: await actorId(),
      actorType: 'user',
      action: active ? 'user.reactivated' : 'user.deactivated',
      subjectUserId: userId,
      targetType: 'user',
      targetId: userId,
      visibility: 'user',
      summary: active ? 'User reactivated' : 'User deactivated',
    });
    revalidatePath('/console/users');
    return { ok: true, message: active ? 'User reactivated.' : 'User deactivated.' };
  });
}

export async function resetMfaAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requireCapability('user:manage');
    const userId = formData.get('userId') as string;
    const res = await authApi(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ resetMfa: true }),
    });
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to reset MFA') };
    const updated = (await res.json()) as { id: string; email: string };
    void sendAdminEmail({
      templateId: 'console.mfa_reset',
      toUserId: updated.id,
      toEmail: updated.email,
      actorUserId: await actorId(),
      subject: 'Your Sovereign MFA was reset',
      text: 'An administrator reset MFA on your Sovereign account.',
      html: '<p>An administrator reset MFA on your Sovereign account.</p>',
    });
    void logActivity({
      actorId: await actorId(),
      actorType: 'user',
      action: 'user.mfa_reset',
      subjectUserId: userId,
      targetType: 'user',
      targetId: userId,
      visibility: 'user',
      summary: 'MFA reset by admin',
    });
    revalidatePath('/console/users');
    return { ok: true, message: 'MFA reset.' };
  });
}

export async function vouchAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireCapability('user:manage');
    const userId = formData.get('userId') as string;
    const res = await authApi(`/api/admin/users/${encodeURIComponent(userId)}/vouch`, {
      method: 'POST',
      body: JSON.stringify({ vouchedBy: session.user.id }),
    });
    if (!res.ok)
      return { ok: false, error: await apiErrorMessage(res, 'Failed to vouch for user') };
    const updated = (await res.json()) as { id: string; email: string };
    void sendAdminEmail({
      templateId: 'console.vouched',
      toUserId: updated.id,
      toEmail: updated.email,
      actorUserId: session.user.id,
      subject: 'You were vouched for on Sovereign',
      text: 'An administrator vouched for your account, granting it full trust.',
      html: '<p>An administrator vouched for your account, granting it full trust.</p>',
    });
    void logActivity({
      actorId: await actorId(),
      actorType: 'user',
      action: 'user.vouched',
      subjectUserId: userId,
      targetType: 'user',
      targetId: userId,
      visibility: 'user',
      summary: 'Vouched by admin (verification level 3)',
    });
    revalidatePath('/console/users');
    return { ok: true, message: 'Vouched.' };
  });
}

export async function revokeVouchAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireCapability('user:manage');
    const userId = formData.get('userId') as string;
    const res = await authApi(`/api/admin/users/${encodeURIComponent(userId)}/vouch`, {
      method: 'DELETE',
      body: JSON.stringify({ vouchedBy: session.user.id }),
    });
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to revoke vouch') };
    const updated = (await res.json()) as { id: string; email: string };
    void sendAdminEmail({
      templateId: 'console.vouch_revoked',
      toUserId: updated.id,
      toEmail: updated.email,
      actorUserId: session.user.id,
      subject: 'Your Sovereign vouch status was revoked',
      text: 'An administrator revoked the vouch on your account.',
      html: '<p>An administrator revoked the vouch on your account.</p>',
    });
    void logActivity({
      actorId: await actorId(),
      actorType: 'user',
      action: 'user.vouch_revoked',
      subjectUserId: userId,
      targetType: 'user',
      targetId: userId,
      visibility: 'user',
      summary: 'Vouch revoked by admin (verification level 2)',
    });
    revalidatePath('/console/users');
    return { ok: true, message: 'Vouch revoked.' };
  });
}

export async function deleteUserAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireCapability('user:manage');
    const userId = formData.get('userId') as string;
    const actor = await actorId();

    if (userId === session.user.id) {
      return { ok: false, error: 'You cannot delete your own account from Console.' };
    }

    // Guard: platform:owner cannot be deleted. This must fail *closed* — the
    // platform-side sweep (`deleteUser`) drops the user's plugin rows, storage
    // and avatar before the auth server gets to refuse the owner, so proceeding
    // on a failed directory lookup would wipe the owner's data while leaving
    // the account itself in place.
    const usersRes = await authApi('/api/admin/users');
    if (!usersRes.ok) {
      return {
        ok: false,
        error: `Could not verify the account before deleting it (${usersRes.status}).`,
      };
    }
    const members = (await usersRes.json()) as Array<{ id: string | null; role: string | null }>;
    const target = members.find((m) => m.id === userId);
    if (target?.role === 'platform:owner') {
      return { ok: false, error: 'The platform owner account cannot be deleted.' };
    }

    void logActivity({
      actorId: actor,
      actorType: 'user',
      action: 'account.deleted',
      subjectUserId: userId,
      targetType: 'user',
      targetId: userId,
      visibility: 'admin',
      summary: 'Admin deleted user account and all data',
      metadata: { userId },
    });

    await deleteUser(userId, 'default');

    revalidatePath('/console/users');
    return { ok: true, message: 'User deleted.' };
  });
}

export async function cancelInviteAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requireCapability('user:manage');
    const email = formData.get('email') as string;
    const res = await authApi(`/api/admin/invites?email=${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to cancel invite') };
    void logActivity({
      actorId: await actorId(),
      actorType: 'user',
      action: 'user.invite_cancelled',
      visibility: 'admin',
      summary: `Invite cancelled for ${email}`,
      metadata: { email },
    });
    revalidatePath('/console/users');
    return { ok: true, message: 'Invite cancelled.' };
  });
}

export type InviteState =
  | { success: true; token: string; email: string; emailWarning?: string }
  | { success: false; error: string };

export async function sendInviteAction(
  _prev: InviteState | null,
  formData: FormData,
): Promise<InviteState> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'user:manage')) {
    return { success: false, error: 'Insufficient privileges to manage users.' };
  }

  const email = (formData.get('email') as string | null)?.trim();
  const expiresInDaysRaw = (formData.get('expiresInDays') as string | null)?.trim();
  const expiresInDays = expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined;
  const plugins = formData.getAll('plugins') as string[];

  if (!email) return { success: false, error: 'Email is required.' };
  if (
    expiresInDays !== undefined &&
    (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)
  ) {
    return { success: false, error: 'Expiry must be a whole number of days between 1 and 365.' };
  }

  const res = await authApi('/api/admin/invites', {
    method: 'POST',
    body: JSON.stringify({
      email,
      expiresInDays,
      invited_by_id: session.user.id,
      invited_by_name: session.user.name ?? undefined,
      plugins: plugins.length > 0 ? plugins : undefined,
    }),
  });
  if (!res.ok) return { success: false, error: `Failed to create invite: ${res.status}` };

  const { token } = (await res.json()) as { token: string; email: string };

  // Read via a computed key so Next.js does not inline the value at build time
  // (the Docker image builds without .env, freezing a literal to localhost:3000).
  const runtimeUrlKey = 'NEXT_PUBLIC_RUNTIME_URL';
  const runtimeUrl =
    process.env[runtimeUrlKey] ?? `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
  const registerUrl = `${runtimeUrl}/register?token=${token}`;
  // Branded rendering (RFC 0031) happens server-side in the runtime, not
  // here — the SDK boundary rule blocks this plugin from importing
  // @sovereignfs/mailer/@sovereignfs/db directly.
  const emailRes = await adminFetch('/api/admin/email-templates/send', {
    method: 'POST',
    actor: true,
    body: JSON.stringify({
      templateId: 'invite',
      toEmail: email,
      actorUserId: session.user.id,
      url: registerUrl,
      source: 'console',
    }),
  });
  const emailData = (await emailRes.json().catch(() => null)) as {
    status?: 'skipped' | 'sent' | 'failed';
    errorCode?: string;
    error?: string;
  } | null;
  const emailResult: { ok: true } | { ok: false; error: string } =
    emailRes.ok && emailData?.status !== 'skipped' && emailData?.status !== 'failed'
      ? { ok: true }
      : {
          ok: false,
          error: emailData?.errorCode ?? emailData?.error ?? `email ${emailRes.status}`,
        };

  void logActivity({
    actorId: await actorId(),
    actorType: 'user',
    action: 'user.invited',
    visibility: 'admin',
    summary: `Invited ${email}`,
    metadata: { email },
  });

  return {
    success: true,
    token,
    email,
    ...(emailResult.ok ? {} : { emailWarning: emailResult.error }),
  };
}

// ─── Per-user capability grants (RFC 0070) ───────────────────────────────────
// Note: GRANTABLE_CAPABILITIES/GrantableCapability are NOT re-exported from
// here — a `'use server'` file may only export async functions; re-exporting
// the plain array constant crashes the page at build/render time. Components
// import them directly from `@/src/capabilities` instead.

export async function listUserCapabilitiesAction(userId: string): Promise<GrantableCapability[]> {
  await requireCapability('user:manage', 'Insufficient privileges to view capabilities.');
  const res = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/capabilities`, {
    actor: true,
  });
  if (!res.ok) return [];
  const grants = (await res.json()) as { capability: GrantableCapability }[];
  return grants.map((g) => g.capability);
}

export async function grantCapabilityAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requireCapability('user:manage', 'Insufficient privileges to grant capabilities.');
    const userId = formData.get('userId') as string;
    const capability = formData.get('capability') as string;
    const res = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/capabilities`, {
      method: 'POST',
      actor: true,
      body: JSON.stringify({ capability }),
    });
    if (!res.ok) {
      return { ok: false, error: await apiErrorMessage(res, 'Failed to grant capability') };
    }
    revalidatePath('/console/users');
    return ACTION_OK;
  });
}

export async function revokeCapabilityAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requireCapability('user:manage', 'Insufficient privileges to revoke capabilities.');
    const userId = formData.get('userId') as string;
    const capability = formData.get('capability') as string;
    const res = await adminFetch(
      `/api/admin/users/${encodeURIComponent(userId)}/capabilities/${encodeURIComponent(capability)}`,
      { method: 'DELETE', actor: true },
    );
    if (!res.ok) {
      return { ok: false, error: await apiErrorMessage(res, 'Failed to revoke capability') };
    }
    revalidatePath('/console/users');
    return ACTION_OK;
  });
}
