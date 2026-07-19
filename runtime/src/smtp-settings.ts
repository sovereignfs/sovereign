import {
  DEFAULT_TENANT_ID,
  getPlatformSetting,
  setPlatformSetting,
  type PlatformDb,
} from '@sovereignfs/db';
import type { MailerConfig } from '@sovereignfs/mailer';
import { decryptSecretValue, encryptSecretValue } from './secrets';

/**
 * Console-managed SMTP settings, stored as individual `platform_settings`
 * rows (not a dedicated table — this reuses the same generic KV mechanism
 * already used for `invite_only`/`root_plugin_id`). The password is never
 * stored in plaintext: it's encrypted with the same AES-256-GCM envelope
 * `sdk.secrets` uses for plugin secrets, keyed by a fixed sentinel context
 * since there's only ever one instance-wide SMTP credential (not a real
 * plugin, no per-plugin/user boundary to enforce).
 */
const SECRET_CONTEXT = {
  tenantId: DEFAULT_TENANT_ID,
  pluginId: 'fs.sovereign.platform',
  scope: 'instance' as const,
  userId: null,
};

const KEYS = {
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
  hasPassword: boolean;
}

export interface SmtpSettingsInput {
  host?: string;
  port?: number;
  user?: string;
  /** Empty/omitted leaves the existing stored password untouched. */
  pass?: string;
  from?: string;
}

/** Read the stored (non-secret) SMTP settings, for display in Console. */
export async function readStoredSmtpSettings(db: PlatformDb): Promise<StoredSmtpSettings> {
  const [host, port, user, from, passEncrypted] = await Promise.all([
    getPlatformSetting(db, KEYS.host),
    getPlatformSetting(db, KEYS.port),
    getPlatformSetting(db, KEYS.user),
    getPlatformSetting(db, KEYS.from),
    getPlatformSetting(db, KEYS.passEncrypted),
  ]);
  return {
    host,
    port: port ? Number(port) : null,
    user,
    from,
    hasPassword: !!passEncrypted,
  };
}

/**
 * Persist Console-provided SMTP settings. `pass` is only overwritten when
 * non-empty — an operator re-saving the form with the password field left
 * blank (showing the "configured" placeholder, never the real value) must
 * not silently clear the stored credential.
 */
export async function writeStoredSmtpSettings(
  db: PlatformDb,
  input: SmtpSettingsInput,
): Promise<void> {
  const writes: Promise<void>[] = [];
  if (input.host !== undefined) writes.push(setPlatformSetting(db, KEYS.host, input.host));
  if (input.port !== undefined) {
    writes.push(setPlatformSetting(db, KEYS.port, String(input.port)));
  }
  if (input.user !== undefined) writes.push(setPlatformSetting(db, KEYS.user, input.user));
  if (input.from !== undefined) writes.push(setPlatformSetting(db, KEYS.from, input.from));
  if (input.pass) {
    writes.push(
      setPlatformSetting(db, KEYS.passEncrypted, encryptSecretValue(input.pass, SECRET_CONTEXT)),
    );
  }
  await Promise.all(writes);
}

/**
 * Resolve the effective mailer config: stored Console values (password
 * decrypted) as explicit overrides, falling through per-field to env vars
 * inside `createMailer()` itself (RFC precedent: `resolveInviteOnly`'s
 * "stored overrides env" semantics, just for 5 fields instead of 1).
 * Called fresh on every send — no caching, so a Console change takes effect
 * immediately without a restart.
 */
export async function resolveEffectiveMailerConfig(db: PlatformDb): Promise<MailerConfig> {
  const stored = await readStoredSmtpSettings(db);
  const passEncrypted = await getPlatformSetting(db, KEYS.passEncrypted);
  return {
    host: stored.host ?? undefined,
    port: stored.port ?? undefined,
    user: stored.user ?? undefined,
    from: stored.from ?? undefined,
    pass: passEncrypted ? decryptSecretValue(passEncrypted, SECRET_CONTEXT) : undefined,
  };
}
