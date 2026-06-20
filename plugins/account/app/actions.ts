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

/**
 * Forward all Set-Cookie headers from an auth-server response to the browser.
 * Called after better-auth operations that create or replace the user's session
 * (e.g. TOTP verify-totp during enrollment creates a new session + deletes the
 * old one). Without this the browser keeps its stale/deleted session token.
 */
async function forwardAuthCookies(authRes: Response): Promise<void> {
  const jar = await cookies();
  const getSetCookie = (authRes.headers as { getSetCookie?: () => string[] }).getSetCookie;
  const rawCookies =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(authRes.headers)
      : (() => {
          const v = authRes.headers.get('set-cookie');
          return v ? [v] : [];
        })();

  for (const raw of rawCookies) {
    const parts = raw.split(';').map((s) => s.trim());
    const nameVal = parts[0] ?? '';
    const eqIdx = nameVal.indexOf('=');
    if (eqIdx === -1) continue;
    const name = nameVal.slice(0, eqIdx);
    const value = nameVal.slice(eqIdx + 1);
    const opts: Parameters<typeof jar.set>[2] = { path: '/' };
    for (const attr of parts.slice(1)) {
      const lower = attr.toLowerCase();
      if (lower === 'httponly') opts.httpOnly = true;
      else if (lower === 'secure') opts.secure = true;
      else if (lower.startsWith('samesite='))
        opts.sameSite = lower.slice('samesite='.length) as 'lax' | 'strict' | 'none';
      else if (lower.startsWith('max-age=')) opts.maxAge = Number(lower.slice('max-age='.length));
      else if (lower.startsWith('path=')) opts.path = attr.slice('path='.length);
    }
    jar.set(name, value, opts);
  }
}

export type TotpSetupState =
  | { ok: true; totpURI: string; qrDataUrl: string; backupCodes: string[] }
  | { ok: false; error: string }
  | null;

/**
 * Start TOTP enrollment: call better-auth's `enable` endpoint to create the
 * twoFactor DB record (secret + unverified backup codes) and return the TOTP
 * URI. The QR is rendered server-side so no QR library is needed client-side.
 * Backup codes are also returned here so they can be shown after the user
 * verifies the code (see verifyTotpEnrollmentAction).
 *
 * Note: calling `get-totp-uri` (the old approach) requires an EXISTING
 * twoFactor record — it throws TOTP_NOT_ENABLED for new users. `enable`
 * creates the record and returns the URI + backup codes in one shot.
 */
export async function getTotpSetupAction(
  _prev: TotpSetupState,
  formData: FormData,
): Promise<TotpSetupState> {
  await sdk.auth.requireSession();
  const password = (formData.get('password') as string | null) ?? '';
  if (!password) return { ok: false, error: 'Password is required.' };

  const res = await authPost('/two-factor/enable', { password });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: data?.message ?? 'Failed to start TOTP setup.' };
  }
  const { totpURI, backupCodes } = (await res.json()) as {
    totpURI: string;
    backupCodes: string[];
  };
  const qrDataUrl = await QRCode.toDataURL(totpURI, { width: 200, margin: 1 });
  return { ok: true, totpURI, qrDataUrl, backupCodes };
}

export type TotpVerifyState = { ok: true } | { ok: false; error: string } | null;

/**
 * Complete TOTP enrollment: verify the code the user entered from their
 * authenticator app. better-auth's `verify-totp` endpoint sets
 * twoFactorEnabled=true, marks the twoFactor record as verified, creates a
 * new session (deleting the old one), and sends back a Set-Cookie header.
 * We forward that cookie to the browser so the user stays signed in.
 */
export async function verifyTotpEnrollmentAction(
  _prev: TotpVerifyState,
  formData: FormData,
): Promise<TotpVerifyState> {
  await sdk.auth.requireSession();
  const code = (formData.get('code') as string | null) ?? '';
  if (!code) return { ok: false, error: 'Enter the 6-digit code from your authenticator app.' };

  const res = await authPost('/two-factor/verify-totp', { code });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: data?.message ?? 'Invalid code. Please try again.' };
  }

  // verify-totp replaces the session — forward the new session cookie so the
  // browser keeps the new token instead of the now-deleted old one.
  await forwardAuthCookies(res);
  await invalidateSessionCache();
  void sdk.activity.log({ action: 'account.totp_enabled', summary: 'TOTP two-factor enabled' });
  revalidatePath('/account/security');
  return { ok: true };
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
