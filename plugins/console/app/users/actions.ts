'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';
import { logActivity } from '@/src/activity';
import { deleteUser } from '@/src/user-deletion';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;
const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000'}`;

async function actorId(): Promise<string | null> {
  return (await headers()).get('x-sovereign-user-id');
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  return fetch(`${AUTH_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
      ...(init?.headers as Record<string, string>),
    },
  });
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
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${SELF_URL}/api/admin/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify({
      deliveryClass: 'administrative',
      source: 'console',
      ...input,
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    status?: 'skipped' | 'sent' | 'failed';
    errorCode?: string;
    error?: string;
  } | null;
  if (res.ok && data?.status !== 'skipped') return { ok: true };
  return { ok: false, error: data?.errorCode ?? data?.error ?? `email ${res.status}` };
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'role:assign')) {
    throw new Error('Insufficient privileges to assign roles.');
  }
  const userId = formData.get('userId') as string;
  const role = formData.get('role') as
    | 'platform:owner'
    | 'platform:admin'
    | 'platform:auditor'
    | 'platform:user';
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`Failed to change role: ${res.status}`);
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
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'user:manage')) {
    throw new Error('Insufficient privileges to manage users.');
  }
  const userId = formData.get('userId') as string;
  const active = formData.get('active') === 'true';
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error(`Failed to update user status: ${res.status}`);
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
}

export async function resetMfaAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const userId = formData.get('userId') as string;
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ resetMfa: true }),
  });
  if (!res.ok) throw new Error(`Failed to reset MFA: ${res.status}`);
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
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'user:manage')) {
    throw new Error('Insufficient privileges to manage users.');
  }

  const userId = formData.get('userId') as string;
  const actor = await actorId();

  // Guard: platform:owner cannot be deleted.
  const usersRes = await adminFetch('/api/admin/users');
  if (usersRes.ok) {
    const members = (await usersRes.json()) as Array<{ id: string | null; role: string | null }>;
    const target = members.find((m) => m.id === userId);
    if (target?.role === 'platform:owner') {
      throw new Error('The platform owner account cannot be deleted.');
    }
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
}

export async function cancelInviteAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'user:manage')) {
    throw new Error('Insufficient privileges to manage users.');
  }
  const email = formData.get('email') as string;
  const res = await adminFetch(`/api/admin/invites?email=${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to cancel invite: ${res.status}`);
  void logActivity({
    actorId: await actorId(),
    actorType: 'user',
    action: 'user.invite_cancelled',
    visibility: 'admin',
    summary: `Invite cancelled for ${email}`,
    metadata: { email },
  });
  revalidatePath('/console/users');
}

export type InviteState =
  | { success: true; token: string; email: string; emailWarning?: string }
  | { success: false; error: string };

export async function sendInviteAction(
  _prev: InviteState | null,
  formData: FormData,
): Promise<InviteState> {
  const session = await sdk.auth.requireSession();

  const email = (formData.get('email') as string | null)?.trim();
  const expiresInDaysRaw = formData.get('expiresInDays') as string | null;
  const expiresInDays = expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined;

  if (!email) return { success: false, error: 'Email is required.' };

  const res = await adminFetch('/api/admin/invites', {
    method: 'POST',
    body: JSON.stringify({
      email,
      expiresInDays,
      invited_by_id: session.user.id,
      invited_by_name: session.user.name ?? undefined,
    }),
  });
  if (!res.ok) return { success: false, error: `Failed to create invite: ${res.status}` };

  const { token } = (await res.json()) as { token: string; email: string };

  // Read via a computed key so Next.js does not inline the value at build time
  // (the Docker image builds without .env, freezing a literal to localhost:3000).
  const runtimeUrlKey = 'NEXT_PUBLIC_RUNTIME_URL';
  const runtimeUrl =
    process.env[runtimeUrlKey] ??
    `http://localhost:${process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000'}`;
  const registerUrl = `${runtimeUrl}/register?token=${token}`;
  const emailResult = await sendAdminEmail({
    templateId: 'console.invite_created',
    toEmail: email,
    actorUserId: session.user.id,
    subject: 'You have been invited to Sovereign',
    text: [
      'You have been invited to join this Sovereign instance.',
      '',
      `Create your account at: ${registerUrl}`,
    ].join('\n'),
    html: `<p>You have been invited to join this Sovereign instance.</p><p><a href="${registerUrl}">Create your account</a></p>`,
    metadata: { expiresInDays: expiresInDays ?? null },
  });

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
