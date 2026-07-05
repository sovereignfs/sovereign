import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { PluginSecretRefRow } from '@sovereignfs/db';
import type { SecretRef, SecretScope } from '@sovereignfs/sdk';

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

export function vaultKeyFromEnv(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new VaultConfigurationError(
      `${KEY_ENV} is required before sdk.secrets can store or read secret values.`,
    );
  }
  const key = decodeKey(raw);
  if (!key) {
    throw new VaultConfigurationError(
      `${KEY_ENV} must be a 32-byte key encoded as base64, base64url, or 64-character hex.`,
    );
  }
  return key;
}

function aadFor(input: {
  tenantId: string;
  pluginId: string;
  scope: SecretScope;
  userId: string | null;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      tenantId: input.tenantId,
      pluginId: input.pluginId,
      scope: input.scope,
      userId: input.userId,
    }),
    'utf8',
  );
}

export function encryptSecretValue(
  value: string,
  context: { tenantId: string; pluginId: string; scope: SecretScope; userId: string | null },
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKeyFromEnv(), iv);
  cipher.setAAD(aadFor(context));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecretValue(
  envelope: string,
  context: { tenantId: string; pluginId: string; scope: SecretScope; userId: string | null },
): string {
  const [version, ivRaw, tagRaw, ciphertextRaw] = envelope.split(':');
  if (version !== ENVELOPE_VERSION || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Unsupported plugin secret ciphertext envelope.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    vaultKeyFromEnv(),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAAD(aadFor(context));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function metadataToJson(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (metadata == null) return null;
  const json = JSON.stringify(metadata);
  if (json.length > 8192) throw new Error('Secret metadata must be 8 KiB or smaller.');
  return json;
}

export function normalizeSecretLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) throw new Error('Secret label is required.');
  return trimmed.slice(0, 120);
}

export function toSecretRef(row: PluginSecretRefRow): SecretRef {
  return {
    id: row.id,
    scope: row.scope,
    label: row.label,
    metadata: parseMetadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
  };
}
