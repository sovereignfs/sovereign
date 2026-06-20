'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import QRCode from 'qrcode';
import { sdk } from '@sovereignfs/sdk';
import { validatePasswordChange } from './_lib/password';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';
const SELF_URL = 'http://localhost:3000';

async function sessionCookie(): Promise<string> {
  return (await headers()).get('cookie') ?? '';
}

/**
 * Drop better-auth's signed session-cache cookie (`session_data`) after a
 * profile change. The runtime middleware verifies sessions from that cookie
 * locally (AUTH-05), so without this the chrome/profile keep showing the old
 * name until the cache window expires. Clearing it forces the next request to
 * re-verify via /api/verify and pick up the change immediately; the session
 * token itself is untouched.
 */
async function invalidateSessionCache(): Promise<void> {
  const jar = await cookies();
  jar.set('better-auth.session_data', '', { maxAge: 0, path: '/' });
  // The `__Secure-`-prefixed name (production, HTTPS) can only be unset with the
  // Secure attribute, so clear it explicitly rather than via delete().
  jar.set('__Secure-better-auth.session_data', '', { maxAge: 0, path: '/', secure: true });
}

/** Call a better-auth endpoint, forwarding the current session cookie. */
async function authPost(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${AUTH_URL}/api/auth${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: await sessionCookie(),
      origin: AUTH_URL,
    },
    body: JSON.stringify(body),
  });
}

/** Change the display name (ACC-02). Delegates to better-auth's update-user. */
export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const name = (formData.get('name') as string | null)?.trim() ?? '';
  if (name.length === 0) throw new Error('Display name is required.');
  if (name.length > 100) throw new Error('Display name must be 100 characters or fewer.');

  const res = await fetch(`${AUTH_URL}/api/auth/update-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: await sessionCookie(),
      // better-auth enforces a CSRF Origin check; the auth server's own base
      // URL is its default trusted origin for this server-to-server call.
      origin: AUTH_URL,
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to update display name: ${res.status}`);
  await invalidateSessionCache();
  void sdk.activity.log({
    action: 'account.display_name_changed',
    summary: 'Display name updated',
  });
  revalidatePath('/account/profile');
}

/** Persist a preference change (ACC-07/08) via the runtime account-prefs route. */
async function patchPrefs(body: Record<string, unknown>): Promise<void> {
  await sdk.auth.requireSession();
  const res = await fetch(`${SELF_URL}/api/account/prefs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: await sessionCookie() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(detail ?? `Failed to save preference: ${res.status}`);
  }
  revalidatePath('/account/preferences');
}

export async function updateTimezoneAction(timezone: string): Promise<void> {
  await patchPrefs({ timezone });
}

export async function updateThemeAction(theme: string): Promise<void> {
  await patchPrefs({ theme });
}

// ── Security (ACC-04/05/06) ───────────────────────────────────────────────

export type PasswordState = { ok: true } | { ok: false; error: string } | null;

/** Change password (ACC-04), surfacing better-auth's error for the form. */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  await sdk.auth.requireSession();
  const currentPassword = (formData.get('currentPassword') as string | null) ?? '';
  const newPassword = (formData.get('newPassword') as string | null) ?? '';
  const confirm = (formData.get('confirmPassword') as string | null) ?? '';

  const invalid = validatePasswordChange(newPassword, confirm);
  if (invalid) return { ok: false, error: invalid };

  try {
    await sdk.auth.changePassword({ currentPassword, newPassword });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to change password.' };
  }
  void sdk.activity.log({ action: 'account.password_changed', summary: 'Password changed' });
  return { ok: true };
}

/** Revoke another session (ACC-06). The current session can't be revoked here. */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const token = formData.get('token') as string | null;
  const isCurrent = formData.get('current') === 'true';
  if (!token || isCurrent) return;
  await sdk.auth.revokeSession(token);
  void sdk.activity.log({ action: 'account.session_revoked', summary: 'Session revoked' });
  revalidatePath('/account/security');
}

// ── TOTP (RFC 0012) ──────────────────────────────────────────────────────

export type TotpSetupState =
  | { ok: true; totpURI: string; qrDataUrl: string }
  | { ok: false; error: string }
  | null;

/**
 * Start TOTP enrollment: fetch the TOTP URI from better-auth and render the QR
 * code server-side so no QR library is needed client-side. The URI is returned
 * for display alongside the QR image (accessible text fallback).
 */
export async function getTotpSetupAction(
  _prev: TotpSetupState,
  formData: FormData,
): Promise<TotpSetupState> {
  await sdk.auth.requireSession();
  const password = (formData.get('password') as string | null) ?? '';
  if (!password) return { ok: false, error: 'Password is required.' };

  const res = await authPost('/two-factor/get-totp-uri', { password });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: data?.message ?? 'Failed to get setup URI.' };
  }
  const { totpURI } = (await res.json()) as { totpURI: string };
  const qrDataUrl = await QRCode.toDataURL(totpURI, { width: 200, margin: 1 });
  return { ok: true, totpURI, qrDataUrl };
}

export type TotpEnableState =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string }
  | null;

/**
 * Complete TOTP enrollment: enable TOTP for the user, then generate backup
 * codes (shown once — the user must save them before dismissing).
 */
export async function enableTotpAction(
  _prev: TotpEnableState,
  formData: FormData,
): Promise<TotpEnableState> {
  await sdk.auth.requireSession();
  const password = (formData.get('password') as string | null) ?? '';
  if (!password) return { ok: false, error: 'Password is required.' };

  const enableRes = await authPost('/two-factor/enable', { password });
  if (!enableRes.ok) {
    const data = (await enableRes.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: data?.message ?? 'Failed to enable TOTP.' };
  }

  const codesRes = await authPost('/two-factor/generate-backup-codes', { password });
  if (!codesRes.ok) {
    const data = (await codesRes.json().catch(() => null)) as { message?: string } | null;
    return {
      ok: false,
      error: data?.message ?? 'TOTP enabled but failed to generate backup codes.',
    };
  }
  const { codes } = (await codesRes.json()) as { codes: string[] };
  await invalidateSessionCache();
  void sdk.activity.log({ action: 'account.totp_enabled', summary: 'TOTP two-factor enabled' });
  revalidatePath('/account/security');
  return { ok: true, backupCodes: codes };
}

export type TotpDisableState = { ok: true } | { ok: false; error: string } | null;

/** Disable TOTP and remove backup codes. Requires password re-confirmation. */
export async function disableTotpAction(
  _prev: TotpDisableState,
  formData: FormData,
): Promise<TotpDisableState> {
  await sdk.auth.requireSession();
  const password = (formData.get('password') as string | null) ?? '';
  if (!password) return { ok: false, error: 'Password is required.' };

  const res = await authPost('/two-factor/disable', { password });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: data?.message ?? 'Failed to disable TOTP.' };
  }
  await invalidateSessionCache();
  void sdk.activity.log({ action: 'account.totp_disabled', summary: 'TOTP two-factor disabled' });
  revalidatePath('/account/security');
  return { ok: true };
}

export type BackupCodesState = { ok: true; codes: string[] } | { ok: false; error: string } | null;

/** Regenerate backup codes (requires password). The old codes are invalidated. */
export async function regenerateBackupCodesAction(
  _prev: BackupCodesState,
  formData: FormData,
): Promise<BackupCodesState> {
  await sdk.auth.requireSession();
  const password = (formData.get('password') as string | null) ?? '';
  if (!password) return { ok: false, error: 'Password is required.' };

  const res = await authPost('/two-factor/generate-backup-codes', { password });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: data?.message ?? 'Failed to regenerate backup codes.' };
  }
  const { codes } = (await res.json()) as { codes: string[] };
  void sdk.activity.log({
    action: 'account.backup_codes_regenerated',
    summary: 'Backup codes regenerated',
  });
  return { ok: true, codes };
}

// ── Passkeys (RFC 0012) ──────────────────────────────────────────────────

export type PasskeyDeleteState = { ok: true } | { ok: false; error: string } | null;

/** Remove a registered passkey by ID. */
export async function deletePasskeyAction(
  _prev: PasskeyDeleteState,
  formData: FormData,
): Promise<PasskeyDeleteState> {
  await sdk.auth.requireSession();
  const id = (formData.get('id') as string | null) ?? '';
  if (!id) return { ok: false, error: 'Passkey ID is required.' };

  const res = await authPost('/passkey/delete-passkey', { id });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: data?.message ?? 'Failed to remove passkey.' };
  }
  void sdk.activity.log({ action: 'account.passkey_removed', summary: 'Passkey removed' });
  revalidatePath('/account/security');
  return { ok: true };
}
