import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import {
  FieldEncryptionConfigError,
  createFieldKeyRow,
  encryptClassesFromEnv,
  fieldKekFromEnv,
  getFieldKeyRow,
  getPlatformDb,
  unwrapKeyMaterial,
} from '@sovereignfs/db';

/**
 * Field-encryption key service (RFC 0092, epic task 8.31 — workstream 0011
 * leg 1). Resolves, unwraps, and caches the per-(class × plugin) DEK and
 * blind-index HMAC key, exposing only *closures* over them — unwrapped key
 * bytes never leave this module. The future `sdk.crypto` host implementation
 * (task 8.32) consumes `getFieldCipher()`; nothing else should.
 *
 * The generic AEAD closures here are deliberately envelope-agnostic: the
 * `svf1` *data* envelope (DEK id, AAD field set, passthrough discriminator)
 * is task 8.32's contract and lands with the SDK surface. This module only
 * guarantees "encrypt/decrypt under the right key, with caller-supplied AAD".
 */

// Re-exported for instrumentation.ts, which by convention imports local
// module files only (never workspace packages directly — see its file doc
// comment and the @libsql/client instrumentation incident it references).
export { assertFieldEncryptionConfig } from '@sovereignfs/db';

interface CachedKeys {
  dek: Buffer;
  hmacKey: Buffer;
}

/** A cipher handle scoped to one (plugin × class). Closures only — no key bytes. */
export interface FieldCipher {
  /** AES-256-GCM. Returns `<iv>:<tag>:<ciphertext>` (base64url segments). */
  encrypt(plaintext: string, aad: Buffer): string;
  /** Inverse of `encrypt`. Throws on authentication failure. */
  decrypt(payload: string, aad: Buffer): string;
  /** HMAC-SHA256 over the input, base64url — the blind-index primitive. */
  hmac(input: string): string;
}

const cache = new Map<string, CachedKeys>();

/** Test hook — clears unwrapped-key cache (e.g. after rotating in a test). */
export function clearFieldKeyCache(): void {
  cache.clear();
}

/** Whether the operator's policy enables this sensitivity class at all. */
export function isClassEnabled(cls: string): boolean {
  return encryptClassesFromEnv().includes(cls);
}

async function resolveKeys(pluginId: string, cls: string): Promise<CachedKeys> {
  const cacheKey = `${pluginId}\u0000${cls}`; // NUL separator - unambiguous even if an id ever contained ':'
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const kek = fieldKekFromEnv();
  if (!kek) {
    throw new FieldEncryptionConfigError(
      `SOVEREIGN_FIELD_KEK is not set — cannot resolve field-encryption keys for ` +
        `plugin "${pluginId}" class "${cls}".`,
    );
  }

  const pdb = await getPlatformDb();
  const row =
    (await getFieldKeyRow(pdb, pluginId, cls)) ??
    (await createFieldKeyRow(pdb, kek, pluginId, cls));

  const keys: CachedKeys = {
    dek: unwrapKeyMaterial(kek, row.wrappedDek, { pluginId, class: cls, purpose: 'dek' }),
    hmacKey: unwrapKeyMaterial(kek, row.wrappedHmacKey, {
      pluginId,
      class: cls,
      purpose: 'hmac',
    }),
  };
  cache.set(cacheKey, keys);
  return keys;
}

/**
 * Resolve (creating on first use) the keys for one (plugin × class) and hand
 * back a cipher handle. The sdk-host layer (task 8.32) is the only intended
 * caller.
 */
export async function getFieldCipher(pluginId: string, cls: string): Promise<FieldCipher> {
  const keys = await resolveKeys(pluginId, cls);
  return {
    encrypt(plaintext: string, aad: Buffer): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keys.dek, iv);
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url'),
      ].join(':');
    },
    decrypt(payload: string, aad: Buffer): string {
      const [ivRaw, tagRaw, ciphertextRaw] = payload.split(':');
      if (!ivRaw || !tagRaw || !ciphertextRaw) {
        throw new FieldEncryptionConfigError('Malformed field ciphertext payload.');
      }
      const decipher = createDecipheriv('aes-256-gcm', keys.dek, Buffer.from(ivRaw, 'base64url'));
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
    hmac(input: string): string {
      return createHmac('sha256', keys.hmacKey).update(input, 'utf8').digest('base64url');
    },
  };
}
