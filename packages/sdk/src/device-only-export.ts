/**
 * Encrypted, user-driven export/import for `device-only` data (RFC 0093 §4
 * Layer 2) — always available, no toggle, no server involvement. This is
 * the mandatory floor Layer 2 promises regardless of whether an instance
 * ever turns on Layer 3's opt-in server backup, and it's what actually
 * answers "device-to-device migration": since `device-only` data has no
 * server copy at all, the only way it moves to a new device is a file the
 * user carries there themselves.
 *
 * Exports every plugin's `device-only-kv.ts` data as a single encrypted
 * blob, wrapped under a user-chosen passphrase (PBKDF2-derived, matching
 * `device-only-crypto.ts`'s recovery-secret wrap parameters) — never the
 * Device Storage Key itself, and never plaintext. Deliberately a **full
 * snapshot on every call**, not incremental — RFC 0093 §4 says
 * "re-generate after changes," so there is no merge/diff logic to get
 * wrong, only "run it again."
 *
 * **Import re-encrypts under the importing device's own key — it never
 * copies ciphertext across devices.** `device-only` data is always
 * encrypted at rest under the *current* device's Device Storage Key
 * (`device-only-kv.ts`), and two devices' keys are never the same secret
 * and are never meant to be (RFC 0093 §2/§3 — one key, set up once, *per
 * device*). The importing device must already have its own key set up
 * before import can run at all.
 */

import { fromBase64Url, toBase64Url } from './device-only-crypto';
import {
  getDeviceOnlyValue,
  listDeviceOnlyKeys,
  listDeviceOnlyPluginIds,
  setDeviceOnlyValue,
} from './device-only-kv';
import type { DeviceOnlyKvError } from './device-only-kv';
import { getUnlockedDeviceStorageKey } from './device-only-session';

const EXPORT_FORMAT_VERSION = 'v1';
const PBKDF2_ITERATIONS = 600_000; // matches device-only-crypto.ts's recovery-secret wrap
const PBKDF2_SALT_BYTES = 16;
const AES_GCM_IV_BYTES = 12;

/** Safe to write to disk as JSON and hand back on import — every field is already a string. */
export interface DeviceOnlyExportFile {
  formatVersion: string;
  kdfAlgorithm: string;
  /** JSON-encoded KDF parameters. */
  kdfParams: string;
  kdfSalt: string;
  /** Base64url `iv || ciphertext` of the full exported payload. */
  wrappedData: string;
}

interface ExportedPayload {
  plugins: Record<string, Record<string, unknown>>;
}

async function deriveExportKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export type DeviceOnlyExportResult =
  { status: 'ok'; file: DeviceOnlyExportFile } | DeviceOnlyKvError;

/**
 * Snapshot every `device-only` value on this device into a single encrypted
 * file, wrapped under `passphrase`. Requires an unlocked session (every
 * value must be decrypted with the current key before it can be
 * re-encrypted under the export passphrase).
 */
export async function exportDeviceOnlyData(passphrase: string): Promise<DeviceOnlyExportResult> {
  const unlocked = await getUnlockedDeviceStorageKey();
  if (unlocked.status !== 'ok') return unlocked;

  const pluginIds = await listDeviceOnlyPluginIds();
  const plugins: Record<string, Record<string, unknown>> = {};
  for (const pluginId of pluginIds) {
    const keys = await listDeviceOnlyKeys(pluginId);
    const entries: Record<string, unknown> = {};
    for (const key of keys) {
      const result = await getDeviceOnlyValue(pluginId, key);
      if (result.status !== 'ok') return result;
      if (result.value !== undefined) entries[key] = result.value;
    }
    plugins[pluginId] = entries;
  }

  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const wrappingKey = await deriveExportKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify({ plugins } satisfies ExportedPayload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      wrappingKey,
      plaintext as BufferSource,
    ),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);

  return {
    status: 'ok',
    file: {
      formatVersion: EXPORT_FORMAT_VERSION,
      kdfAlgorithm: 'PBKDF2-SHA256',
      kdfParams: JSON.stringify({ iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }),
      kdfSalt: toBase64Url(salt),
      wrappedData: toBase64Url(combined),
    },
  };
}

export type DeviceOnlyImportResult =
  | { status: 'ok'; pluginCount: number; entryCount: number }
  | DeviceOnlyKvError
  | { status: 'invalid-passphrase' }
  | { status: 'invalid-file' };

/**
 * Restore an `exportDeviceOnlyData` file into this device's own store,
 * re-encrypting every value under this device's own unlocked Device Storage
 * Key. A full restore, not a merge — an existing value under the same
 * plugin/key on this device is overwritten.
 */
export async function importDeviceOnlyData(
  file: DeviceOnlyExportFile,
  passphrase: string,
): Promise<DeviceOnlyImportResult> {
  if (file.formatVersion !== EXPORT_FORMAT_VERSION) {
    return { status: 'invalid-file' };
  }

  const unlocked = await getUnlockedDeviceStorageKey();
  if (unlocked.status !== 'ok') return unlocked;

  let payload: ExportedPayload;
  try {
    const salt = fromBase64Url(file.kdfSalt);
    const wrappingKey = await deriveExportKey(passphrase, salt);
    const combined = fromBase64Url(file.wrappedData);
    const iv = combined.slice(0, AES_GCM_IV_BYTES);
    const ciphertext = combined.slice(AES_GCM_IV_BYTES);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      wrappingKey,
      ciphertext as BufferSource,
    );
    payload = JSON.parse(new TextDecoder().decode(plaintext)) as ExportedPayload;
  } catch {
    return { status: 'invalid-passphrase' };
  }

  let pluginCount = 0;
  let entryCount = 0;
  for (const [pluginId, entries] of Object.entries(payload.plugins)) {
    pluginCount++;
    for (const [key, value] of Object.entries(entries)) {
      const result = await setDeviceOnlyValue(pluginId, key, value);
      if (result.status !== 'ok') return result;
      entryCount++;
    }
  }

  return { status: 'ok', pluginCount, entryCount };
}
