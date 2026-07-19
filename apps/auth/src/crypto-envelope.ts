import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM envelope for the auth server's own local copy of the SMTP
 * password (Console-managed SMTP settings). Deliberately self-contained
 * rather than imported from `runtime/src/secrets.ts` — apps/auth does not
 * depend on `runtime` or `packages/db` (see `apps/auth/src/db.ts`'s header
 * comment); this is the same algorithm, key source, and envelope format
 * (`sv1:iv:tag:ciphertext`, `SOVEREIGN_VAULT_KEY`) so the two are
 * conceptually interchangeable, but each process only ever decrypts the
 * copy it wrote itself.
 */
const KEY_ENV = 'SOVEREIGN_VAULT_KEY';
const ENVELOPE_VERSION = 'sv1';

export class VaultConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultConfigurationError';
  }
}

function decodeKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  for (const normalized of [trimmed, trimmed.replace(/-/g, '+').replace(/_/g, '/')]) {
    const key = Buffer.from(normalized, 'base64');
    if (key.length === 32) return key;
  }
  return null;
}

function vaultKeyFromEnv(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new VaultConfigurationError(`${KEY_ENV} is required to store or read SMTP settings.`);
  }
  const key = decodeKey(raw);
  if (!key) {
    throw new VaultConfigurationError(
      `${KEY_ENV} must be a 32-byte key encoded as base64, base64url, or 64-character hex.`,
    );
  }
  return key;
}

const AAD = Buffer.from('sovereign-auth-smtp-settings', 'utf8');

export function encryptValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKeyFromEnv(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptValue(envelope: string): string {
  const [version, ivRaw, tagRaw, ciphertextRaw] = envelope.split(':');
  if (version !== ENVELOPE_VERSION || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Unsupported SMTP settings ciphertext envelope.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    vaultKeyFromEnv(),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
