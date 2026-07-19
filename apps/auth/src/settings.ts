import { decryptValue, encryptValue } from './crypto-envelope';
import { authGet, authRun } from './db';

/**
 * Resolve the effective invite-only flag: a stored Console setting overrides
 * the AUTH_INVITE_ONLY env default; when nothing is stored, the env value
 * applies (CON-10 — toggling must not require an env edit or restart).
 */
export function resolveInviteOnly(
  storedValue: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (storedValue === 'true') return true;
  if (storedValue === 'false') return false;
  return envDefault;
}

/** Read the stored invite-only setting; null when never toggled. */
export async function readInviteOnlySetting(): Promise<string | null> {
  const row = await authGet<{ value: string }>(
    "SELECT value FROM auth_settings WHERE key = 'invite_only'",
  );
  return row?.value ?? null;
}

/** Persist the invite-only setting (upsert). */
export async function writeInviteOnlySetting(inviteOnly: boolean): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await authRun(
    `INSERT INTO auth_settings (key, value, updated_at) VALUES ('invite_only', ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [String(inviteOnly), now],
  );
}

// ---------------------------------------------------------------------------
// SMTP settings (Console-managed, dual-written from the runtime's admin
// route into this table so the auth server's own mailer — password reset,
// email verification — never depends on a live call to runtime).
// ---------------------------------------------------------------------------

const SMTP_KEYS = {
  host: 'smtp_host',
  port: 'smtp_port',
  user: 'smtp_user',
  from: 'smtp_from',
  passEncrypted: 'smtp_pass_encrypted',
} as const;

export interface StoredSmtpSettings {
  host: string | null;
  port: number | null;
  user: string | null;
  from: string | null;
  pass: string | null;
}

async function readSetting(key: string): Promise<string | null> {
  const row = await authGet<{ value: string }>('SELECT value FROM auth_settings WHERE key = ?', [
    key,
  ]);
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await authRun(
    `INSERT INTO auth_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
  );
}

/** Read the stored SMTP settings (password decrypted); each field null when never set. */
export async function readSmtpSettings(): Promise<StoredSmtpSettings> {
  const [host, port, user, from, passEncrypted] = await Promise.all([
    readSetting(SMTP_KEYS.host),
    readSetting(SMTP_KEYS.port),
    readSetting(SMTP_KEYS.user),
    readSetting(SMTP_KEYS.from),
    readSetting(SMTP_KEYS.passEncrypted),
  ]);
  return {
    host,
    port: port ? Number(port) : null,
    user,
    from,
    pass: passEncrypted ? decryptValue(passEncrypted) : null,
  };
}

export interface SmtpSettingsInput {
  host?: string;
  port?: number;
  user?: string;
  /** Empty/omitted leaves the existing stored password untouched. */
  pass?: string;
  from?: string;
}

/**
 * Persist the auth server's local copy of Console-managed SMTP settings.
 * `pass` is only overwritten when non-empty — mirrors the runtime side
 * (`runtime/src/smtp-settings.ts`) exactly, so a re-save with the password
 * field left blank never clears the stored credential.
 */
export async function writeSmtpSettings(input: SmtpSettingsInput): Promise<void> {
  const writes: Promise<void>[] = [];
  if (input.host !== undefined) writes.push(writeSetting(SMTP_KEYS.host, input.host));
  if (input.port !== undefined) writes.push(writeSetting(SMTP_KEYS.port, String(input.port)));
  if (input.user !== undefined) writes.push(writeSetting(SMTP_KEYS.user, input.user));
  if (input.from !== undefined) writes.push(writeSetting(SMTP_KEYS.from, input.from));
  if (input.pass) {
    writes.push(writeSetting(SMTP_KEYS.passEncrypted, encryptValue(input.pass)));
  }
  await Promise.all(writes);
}
