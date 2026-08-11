import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { PlatformDb } from './client';
import { dbAll, dbGet, dbRun } from './exec';

/**
 * Field-encryption key management (RFC 0092, epic task 8.31 — workstream 0011
 * leg 1). The KEK→DEK envelope layer under app-level field encryption:
 *
 * - `SOVEREIGN_FIELD_KEK` is the master Key Encryption Key — 32 bytes from the
 *   environment, same encoding and fail-fast discipline as
 *   `SOVEREIGN_VAULT_KEY` (`runtime/src/secrets.ts`), and deliberately a
 *   *different* key: the vault protects a handful of high-value secrets,
 *   field encryption covers broad routine data — different rotation cadence,
 *   different blast radius.
 * - Each (sensitivity class × plugin) pair gets its own Data Encryption Key
 *   and its own blind-index HMAC key, generated on first use and stored
 *   wrapped under the KEK in the `field_encryption_keys` platform table.
 * - `SOVEREIGN_ENCRYPT_CLASSES` is the operator policy (comma-separated class
 *   list). Policy-set-but-KEK-unset is a hard boot error; both-unset is a
 *   silent no-op — an instance that never opts in behaves exactly as before.
 *
 * This module holds the primitives shared by the runtime's key service
 * (`runtime/src/field-encryption-keys.ts` — caching, closures for the future
 * sdk-host layer) and the `sv keys rotate-field-kek` tool
 * (`scripts/rotate-field-kek.ts`). It never caches unwrapped key material
 * itself; callers own that lifecycle.
 */

export const FIELD_KEK_ENV = 'SOVEREIGN_FIELD_KEK';
export const ENCRYPT_CLASSES_ENV = 'SOVEREIGN_ENCRYPT_CLASSES';

/** Envelope version for *wrapped key* material (distinct from leg 2's `svf1` data envelope). */
const KEY_WRAP_VERSION = 'svfk1';

export class FieldEncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldEncryptionConfigError';
  }
}

/** Same encoding rules as `SOVEREIGN_VAULT_KEY` (runtime/src/secrets.ts) — kept in sync intentionally. */
function decodeKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  for (const normalized of [trimmed, trimmed.replace(/-/g, '+').replace(/_/g, '/')]) {
    const key = Buffer.from(normalized, 'base64');
    if (key.length === 32) return key;
  }
  return null;
}

/**
 * Reads `SOVEREIGN_FIELD_KEK`. Absence is not an error — field encryption is
 * opt-in via `SOVEREIGN_ENCRYPT_CLASSES`, and `assertFieldEncryptionConfig`
 * enforces the policy/key pairing at boot. A key that is set but malformed is
 * a hard configuration error (fail-fast), so a typo never silently disables
 * encryption.
 */
export function fieldKekFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer | undefined {
  const raw = env[FIELD_KEK_ENV];
  if (!raw || raw.trim().length === 0) return undefined;
  const key = decodeKey(raw);
  if (!key) {
    throw new FieldEncryptionConfigError(
      `${FIELD_KEK_ENV} must be a 32-byte key encoded as base64, base64url, or 64-character hex.`,
    );
  }
  return key;
}

/**
 * Parses `SOVEREIGN_ENCRYPT_CLASSES` into a normalized, deduplicated class
 * list. Class *names* are free-form strings at this layer — the sensitivity
 * taxonomy enum ships with the SDK surface (epic task 8.32); this layer only
 * cares whether the policy is empty or not.
 */
export function encryptClassesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env[ENCRYPT_CLASSES_ENV];
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const cls = part.trim().toLowerCase();
    if (cls.length > 0) seen.add(cls);
  }
  return [...seen];
}

/**
 * Boot guard: a non-empty `SOVEREIGN_ENCRYPT_CLASSES` policy without a KEK is
 * a hard error naming both variables — never a silent plaintext fallback. The
 * reverse (KEK set, policy empty) is allowed: an operator may stage the key
 * before enabling any class. Both-unset boots exactly as today.
 *
 * Also surfaces a malformed KEK immediately (via `fieldKekFromEnv`), so the
 * failure happens at startup, not on the first write that needs the key.
 */
export function assertFieldEncryptionConfig(env: NodeJS.ProcessEnv = process.env): void {
  const classes = encryptClassesFromEnv(env);
  const kek = fieldKekFromEnv(env);
  if (classes.length > 0 && !kek) {
    throw new FieldEncryptionConfigError(
      `${ENCRYPT_CLASSES_ENV} is set (${classes.join(', ')}) but ${FIELD_KEK_ENV} is not. ` +
        `Field encryption cannot run without its key — set ${FIELD_KEK_ENV} (generate with ` +
        `\`openssl rand -base64 32\`), or unset ${ENCRYPT_CLASSES_ENV} to disable field encryption.`,
    );
  }
}

/**
 * Short, non-secret KEK identifier stored alongside each wrapped row — lets
 * `sv keys rotate-field-kek` tell which KEK wraps a row (resume after an
 * interrupted rotation) and turns "wrong key" into a precise error instead of
 * a generic GCM authentication failure.
 */
export function kekFingerprint(kek: Buffer): string {
  return createHash('sha256').update(kek).digest('hex').slice(0, 16);
}

/** The two kinds of key material a `field_encryption_keys` row wraps. */
export type WrappedKeyPurpose = 'dek' | 'hmac';

function keyWrapAad(input: {
  pluginId: string;
  class: string;
  purpose: WrappedKeyPurpose;
}): Buffer {
  return Buffer.from(
    JSON.stringify({ pluginId: input.pluginId, class: input.class, purpose: input.purpose }),
    'utf8',
  );
}

/**
 * Wrap 32 bytes of key material under the KEK (AES-256-GCM, random IV, AAD
 * bound to plugin/class/purpose so a wrapped value replayed into a different
 * row or column fails authentication). Envelope: `svfk1:<iv>:<tag>:<ciphertext>`.
 */
export function wrapKeyMaterial(
  kek: Buffer,
  material: Buffer,
  context: { pluginId: string; class: string; purpose: WrappedKeyPurpose },
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  cipher.setAAD(keyWrapAad(context));
  const ciphertext = Buffer.concat([cipher.update(material), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    KEY_WRAP_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

/** Unwrap a `svfk1` envelope. Throws `FieldEncryptionConfigError` on version/auth mismatch. */
export function unwrapKeyMaterial(
  kek: Buffer,
  envelope: string,
  context: { pluginId: string; class: string; purpose: WrappedKeyPurpose },
): Buffer {
  const [version, ivRaw, tagRaw, ciphertextRaw] = envelope.split(':');
  if (version !== KEY_WRAP_VERSION || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new FieldEncryptionConfigError(
      `Unsupported wrapped-key envelope (expected ${KEY_WRAP_VERSION}).`,
    );
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(ivRaw, 'base64url'));
    decipher.setAAD(keyWrapAad(context));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
      decipher.final(),
    ]);
  } catch {
    throw new FieldEncryptionConfigError(
      `Could not unwrap the ${context.purpose} key for plugin "${context.pluginId}" class ` +
        `"${context.class}" — ${FIELD_KEK_ENV} is likely not the KEK this row was wrapped under.`,
    );
  }
}

/** One `field_encryption_keys` row, as read back via portable raw SQL. */
export interface FieldEncryptionKeyRow {
  id: string;
  pluginId: string;
  class: string;
  wrappedDek: string;
  wrappedHmacKey: string;
  /** The outgoing HMAC key during a blind-index rotation window; null when no window is open. */
  wrappedHmacKeyPrevious: string | null;
  /** Unix seconds the current rotation window opened; null when none. */
  hmacRotationStartedAt: number | null;
  kekFingerprint: string;
  createdAt: number;
  updatedAt: number;
}

const ROW_COLUMNS = sql.raw(
  'id, plugin_id AS "pluginId", class, wrapped_dek AS "wrappedDek", ' +
    'wrapped_hmac_key AS "wrappedHmacKey", ' +
    'wrapped_hmac_key_previous AS "wrappedHmacKeyPrevious", ' +
    'hmac_rotation_started_at AS "hmacRotationStartedAt", ' +
    'kek_fingerprint AS "kekFingerprint", ' +
    'created_at AS "createdAt", updated_at AS "updatedAt"',
);

/** Fetch the wrapped-key row for one (plugin × class), if it exists. */
export async function getFieldKeyRow(
  pdb: PlatformDb,
  pluginId: string,
  cls: string,
): Promise<FieldEncryptionKeyRow | undefined> {
  return dbGet<FieldEncryptionKeyRow>(
    pdb,
    sql`SELECT ${ROW_COLUMNS} FROM field_encryption_keys WHERE plugin_id = ${pluginId} AND class = ${cls}`,
  );
}

/**
 * Fetch a wrapped-key row by its id — the `svf1` data envelope (RFC 0092,
 * task 8.32) records the DEK id, and decryption resolves the row (and thus
 * the class and owning plugin) from it.
 */
export async function getFieldKeyRowById(
  pdb: PlatformDb,
  id: string,
): Promise<FieldEncryptionKeyRow | undefined> {
  return dbGet<FieldEncryptionKeyRow>(
    pdb,
    sql`SELECT ${ROW_COLUMNS} FROM field_encryption_keys WHERE id = ${id}`,
  );
}

/** All wrapped-key rows — rotation iterates these. */
export async function listFieldKeyRows(pdb: PlatformDb): Promise<FieldEncryptionKeyRow[]> {
  return dbAll<FieldEncryptionKeyRow>(
    pdb,
    sql`SELECT ${ROW_COLUMNS} FROM field_encryption_keys ORDER BY plugin_id, class`,
  );
}

/**
 * Generate, wrap, and persist a fresh DEK + HMAC key pair for one
 * (plugin × class). `ON CONFLICT DO NOTHING` + re-read makes the first-use
 * race benign: two concurrent writers both try to insert, one wins, both read
 * back the same row.
 */
export async function createFieldKeyRow(
  pdb: PlatformDb,
  kek: Buffer,
  pluginId: string,
  cls: string,
): Promise<FieldEncryptionKeyRow> {
  const now = Math.floor(Date.now() / 1000);
  const id = randomBytes(16).toString('hex');
  const wrappedDek = wrapKeyMaterial(kek, randomBytes(32), {
    pluginId,
    class: cls,
    purpose: 'dek',
  });
  const wrappedHmacKey = wrapKeyMaterial(kek, randomBytes(32), {
    pluginId,
    class: cls,
    purpose: 'hmac',
  });
  await dbRun(
    pdb,
    sql`INSERT INTO field_encryption_keys
          (id, plugin_id, class, wrapped_dek, wrapped_hmac_key, kek_fingerprint, created_at, updated_at)
        VALUES (${id}, ${pluginId}, ${cls}, ${wrappedDek}, ${wrappedHmacKey}, ${kekFingerprint(kek)}, ${now}, ${now})
        ON CONFLICT (plugin_id, class) DO NOTHING`,
  );
  const row = await getFieldKeyRow(pdb, pluginId, cls);
  if (!row) {
    throw new FieldEncryptionConfigError(
      `Failed to persist field-encryption keys for plugin "${pluginId}" class "${cls}".`,
    );
  }
  return row;
}

/**
 * Rewrite one row's wrapped material — used only by KEK rotation.
 * `wrappedHmacKeyPrevious` is explicit (not defaulted): a KEK rotation that
 * runs during an open blind-index rotation window must re-wrap the previous
 * HMAC key too, and passing `null` when a previous key exists would silently
 * destroy the dual-read window — callers state their intent.
 */
export async function updateFieldKeyRowWrapped(
  pdb: PlatformDb,
  id: string,
  wrappedDek: string,
  wrappedHmacKey: string,
  wrappedHmacKeyPrevious: string | null,
  fingerprint: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE field_encryption_keys
        SET wrapped_dek = ${wrappedDek}, wrapped_hmac_key = ${wrappedHmacKey},
            wrapped_hmac_key_previous = ${wrappedHmacKeyPrevious},
            kek_fingerprint = ${fingerprint}, updated_at = ${now}
        WHERE id = ${id}`,
  );
}

/**
 * Open a blind-index rotation window (RFC 0092 gate B): the current HMAC key
 * becomes `previous`, the freshly wrapped new key becomes current. Refuses to
 * stack windows — a row with an unfinished rotation is left untouched (the
 * caller detects this via zero rows changed and tells the operator to resume).
 */
export async function startHmacRotation(
  pdb: PlatformDb,
  id: string,
  newWrappedHmacKey: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE field_encryption_keys
        SET wrapped_hmac_key_previous = wrapped_hmac_key,
            wrapped_hmac_key = ${newWrappedHmacKey},
            hmac_rotation_started_at = ${now},
            updated_at = ${now}
        WHERE id = ${id} AND wrapped_hmac_key_previous IS NULL`,
  );
  const row = await dbGet<{ started: number | null }>(
    pdb,
    sql`SELECT hmac_rotation_started_at AS started FROM field_encryption_keys WHERE id = ${id}`,
  );
  return row?.started === now;
}

/** Close a rotation window after a clean full re-seal — the old key is gone. */
export async function completeHmacRotation(pdb: PlatformDb, id: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE field_encryption_keys
        SET wrapped_hmac_key_previous = NULL, hmac_rotation_started_at = NULL, updated_at = ${now}
        WHERE id = ${id}`,
  );
}

/** Rows with an open rotation window — drives the boot staleness warning and --status. */
export async function listOpenHmacRotations(pdb: PlatformDb): Promise<FieldEncryptionKeyRow[]> {
  return dbAll<FieldEncryptionKeyRow>(
    pdb,
    sql`SELECT ${ROW_COLUMNS} FROM field_encryption_keys
        WHERE wrapped_hmac_key_previous IS NOT NULL ORDER BY plugin_id, class`,
  );
}

/** One persisted classified-table registration (RFC 0092 gate B). */
export interface FieldTableRegistrationRow {
  id: string;
  pluginId: string;
  tableName: string;
  /** JSON — see `FieldTableMetadata` in @sovereignfs/sdk. */
  metadata: string;
  updatedAt: number;
}

const REGISTRATION_COLUMNS = sql.raw(
  'id, plugin_id AS "pluginId", table_name AS "tableName", metadata, updated_at AS "updatedAt"',
);

/** Idempotent upsert — `sdk.crypto.registerTables()` calls this on every runtime registration. */
export async function upsertFieldTableRegistration(
  pdb: PlatformDb,
  pluginId: string,
  tableName: string,
  metadataJson: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const id = randomBytes(16).toString('hex');
  await dbRun(
    pdb,
    sql`INSERT INTO field_table_registrations (id, plugin_id, table_name, metadata, updated_at)
        VALUES (${id}, ${pluginId}, ${tableName}, ${metadataJson}, ${now})
        ON CONFLICT (plugin_id, table_name)
        DO UPDATE SET metadata = ${metadataJson}, updated_at = ${now}`,
  );
}

/** All registrations, optionally scoped to one plugin — the walker's work list. */
export async function listFieldTableRegistrations(
  pdb: PlatformDb,
  pluginId?: string,
): Promise<FieldTableRegistrationRow[]> {
  if (pluginId) {
    return dbAll<FieldTableRegistrationRow>(
      pdb,
      sql`SELECT ${REGISTRATION_COLUMNS} FROM field_table_registrations
          WHERE plugin_id = ${pluginId} ORDER BY table_name`,
    );
  }
  return dbAll<FieldTableRegistrationRow>(
    pdb,
    sql`SELECT ${REGISTRATION_COLUMNS} FROM field_table_registrations
        ORDER BY plugin_id, table_name`,
  );
}

/** The re-seal walker's resume point for one (job × plugin × table), if any. */
export async function getResealCheckpoint(
  pdb: PlatformDb,
  job: string,
  pluginId: string,
  tableName: string,
): Promise<string | undefined> {
  const row = await dbGet<{ lastPk: string }>(
    pdb,
    sql`SELECT last_pk AS "lastPk" FROM field_reseal_checkpoints
        WHERE job = ${job} AND plugin_id = ${pluginId} AND table_name = ${tableName}`,
  );
  return row?.lastPk;
}

export async function upsertResealCheckpoint(
  pdb: PlatformDb,
  job: string,
  pluginId: string,
  tableName: string,
  lastPk: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const id = randomBytes(16).toString('hex');
  await dbRun(
    pdb,
    sql`INSERT INTO field_reseal_checkpoints (id, job, plugin_id, table_name, last_pk, updated_at)
        VALUES (${id}, ${job}, ${pluginId}, ${tableName}, ${lastPk}, ${now})
        ON CONFLICT (job, plugin_id, table_name)
        DO UPDATE SET last_pk = ${lastPk}, updated_at = ${now}`,
  );
}

/** Delete the checkpoint when a table's pass completes cleanly. */
export async function clearResealCheckpoint(
  pdb: PlatformDb,
  job: string,
  pluginId: string,
  tableName: string,
): Promise<void> {
  await dbRun(
    pdb,
    sql`DELETE FROM field_reseal_checkpoints
        WHERE job = ${job} AND plugin_id = ${pluginId} AND table_name = ${tableName}`,
  );
}
