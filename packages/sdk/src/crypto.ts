import { headers } from 'next/headers';
import { requireHost } from './host';
import { getFieldColumns, getTableFieldMetadata } from './field-schema';
import type {
  CryptoContext,
  DecryptFieldOptions,
  EncryptFieldOptions,
  HashFieldOptions,
} from './types';
import { FIELD_DATA_PREFIX, FIELD_PASSTHROUGH_PREFIX } from './types';

/**
 * Server-side field encryption (RFC 0092, epic tasks 8.32 + 8.33) — the
 * imperative half of app-level field encryption. Values are encrypted in the
 * runtime under a per-(sensitivity class × plugin) Data Encryption Key
 * before they reach the database, so the database only ever stores
 * ciphertext.
 *
 * Distinct from `sdk.e2ee` (RFC 0060, client-side): the runtime CAN decrypt
 * a field encrypted here — the protection is against the database and its
 * operator, not against the app server.
 *
 * Requires the `crypto:use` manifest permission.
 *
 * Policy semantics (deliberate, documented): whether a value is actually
 * encrypted is the operator's decision via `SOVEREIGN_ENCRYPT_CLASSES` —
 * plugin code stays policy-agnostic. When a sensitivity class is not enabled,
 * `encryptField` returns a passthrough envelope (`svf0:`) rather than
 * ciphertext (`svf1:`); `decryptField` handles both transparently.
 * Decryption never consults the policy — ciphertext written while a class
 * was enabled stays readable after the class is disabled.
 *
 * Most plugins never call `encryptField`/`decryptField` directly: classify
 * columns with `encryptedText()`/`blindIndex()` (`@sovereignfs/sdk/drizzle`)
 * and use `seal()`/`open()` below — one mechanical call per statement.
 */

const DEFAULT_TENANT_ID = 'default';

async function cryptoContext(): Promise<CryptoContext> {
  let pluginId: string | null = null;
  try {
    const h = await headers();
    pluginId = h.get('x-sovereign-plugin-id');
  } catch {
    // Outside a Next.js request context (e.g. a portability resolver) — the
    // host falls back to the portability plugin context and rejects the call
    // if no plugin identity resolves there either.
  }
  return { tenantId: DEFAULT_TENANT_ID, pluginId };
}

function isEnvelope(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith(`${FIELD_DATA_PREFIX}:`) || value.startsWith(`${FIELD_PASSTHROUGH_PREFIX}:`))
  );
}

type Row = Record<string, unknown>;

async function sealOne(table: object, row: Row): Promise<Row> {
  const fields = getFieldColumns(table);
  const sealed: Row = { ...row };
  // Encrypted columns first — blind indexes need the original plaintext.
  for (const field of fields) {
    if (field.meta.kind !== 'encrypted') continue;
    const value = row[field.key];
    if (value === undefined || value === null) continue;
    if (isEnvelope(value)) continue; // already sealed — idempotent
    if (typeof value !== 'string') {
      throw new Error(
        `sdk.crypto.seal: classified column "${field.key}" expects a string, got ${typeof value}.`,
      );
    }
    sealed[field.key] = await crypto.encryptField(value, {
      sensitivity: field.meta.sensitivity,
      context: field.columnName,
    });
  }
  for (const field of fields) {
    if (field.meta.kind !== 'blindIndex') continue;
    const sourceKey = field.meta.source;
    if (!(sourceKey in row)) continue; // source absent (partial update) — leave untouched
    const sourceValue = row[sourceKey];
    if (sourceValue === undefined || sourceValue === null) {
      sealed[field.key] = null;
      continue;
    }
    if (isEnvelope(sourceValue)) {
      // Source arrived pre-sealed — the plaintext is gone, so the index
      // cannot be recomputed. If the row still carries its index value the
      // pair is consistent and passes through (idempotent re-seal);
      // otherwise require the plaintext.
      if (row[field.key] !== undefined && row[field.key] !== null) continue;
      throw new Error(
        `sdk.crypto.seal: blind index "${field.key}" needs the plaintext of "${sourceKey}" ` +
          'in the same row — open() the row before modifying and re-sealing it.',
      );
    }
    const sourceField = fields.find((f) => f.key === sourceKey && f.meta.kind === 'encrypted');
    if (!sourceField || sourceField.meta.kind !== 'encrypted') {
      throw new Error(
        `sdk.crypto.seal: blind index "${field.key}" points at "${sourceKey}", which is not an ` +
          'encryptedText() column of this table.',
      );
    }
    sealed[field.key] = await crypto.hashField(String(sourceValue), {
      sensitivity: sourceField.meta.sensitivity,
    });
  }
  return sealed;
}

async function openOne(table: object, row: Row): Promise<Row> {
  const fields = getFieldColumns(table);
  const opened: Row = { ...row };
  for (const field of fields) {
    if (field.meta.kind !== 'encrypted') continue;
    const value = row[field.key];
    if (!isEnvelope(value)) continue; // null, absent, or pre-feature plaintext — leave as-is
    opened[field.key] = await crypto.decryptField(value, { context: field.columnName });
  }
  return opened;
}

/** Server-side field encryption (RFC 0092). Requires the `crypto:use` permission. */
export const crypto = {
  /**
   * Encrypt a field value under the calling plugin's key for the given
   * sensitivity class. Returns an opaque envelope string to store in an
   * ordinary text column — `svf1:` (ciphertext) when the operator's policy
   * enables the class, `svf0:` (encoded passthrough) when it doesn't.
   *
   * `context` binds the ciphertext to a caller-chosen scope (e.g. a column
   * name): decryption must present the same value or fail. Defaults to `''`.
   */
  async encryptField(value: string, options: EncryptFieldOptions): Promise<string> {
    const context = await cryptoContext();
    return requireHost().crypto.encryptField(value, options, context);
  },

  /**
   * Decrypt an envelope produced by `encryptField` (either `svf1:` or
   * `svf0:`). Fails if the envelope belongs to a different plugin, the
   * `context` doesn't match the one used at encryption time, or the
   * ciphertext was tampered with.
   */
  async decryptField(envelope: string, options: DecryptFieldOptions = {}): Promise<string> {
    const context = await cryptoContext();
    return requireHost().crypto.decryptField(envelope, options, context);
  },

  /**
   * The blind-index primitive: a deterministic keyed hash of `value` under
   * the calling plugin's per-class HMAC key. Use it to query a `blindIndex`
   * column: `WHERE notes_bidx = await sdk.crypto.hashField(term, { sensitivity })`.
   * Exact match only. On an instance with no `SOVEREIGN_FIELD_KEK`, falls
   * back to an unkeyed hash (documented: such instances store plaintext
   * anyway; enabling encryption later re-seals via the backfill tool).
   */
  async hashField(value: string, options: HashFieldOptions): Promise<string> {
    const context = await cryptoContext();
    return requireHost().crypto.hashField(value, options, context);
  },

  /**
   * Blind-index candidates for rotation-safe queries (RFC 0092 gate B):
   * `[current]` normally, `[current, previous]` during a rotation window.
   * Pass to `blindIndexMatch()` (`@sovereignfs/sdk/drizzle`) — the
   * recommended query pattern; a bare `eq(col, await hashField(...))` keeps
   * working but misses old-key rows mid-rotation.
   */
  async hashFieldCandidates(value: string, options: HashFieldOptions): Promise<string[]> {
    const context = await cryptoContext();
    return requireHost().crypto.hashFieldCandidates(value, options, context);
  },

  /**
   * Register this plugin's classified tables (RFC 0092 gate B) — call once
   * at server-entry scope (the `sdk.portability.provideExport` lifecycle).
   * Registrations persist platform-side so the operator tools
   * (`sv db encrypt-fields`, `sv keys rotate-blind-index`) can walk these
   * tables from outside the runtime process. An unregistered classified
   * table is skipped by those tools — visibly, in their output.
   */
  async registerTables(...tables: object[]): Promise<void> {
    const context = await cryptoContext();
    const metadata = tables.map((t) => getTableFieldMetadata(t));
    return requireHost().crypto.registerTables(metadata, context);
  },

  seal,
  open,
};

/**
 * Seal a row (or rows) for writing to a table with classified columns:
 * encrypts every `encryptedText()` value present and computes every
 * `blindIndex()` whose source is present. Non-mutating — returns new
 * objects. Idempotent for already-sealed encrypted values.
 *
 * ```ts
 * await db.insert(entries).values(await sdk.crypto.seal(entries, row));
 * ```
 */
async function seal<T extends Row>(table: object, rows: T): Promise<T>;
async function seal<T extends Row>(table: object, rows: T[]): Promise<T[]>;
async function seal(table: object, rows: Row | Row[]): Promise<Row | Row[]> {
  if (Array.isArray(rows)) {
    return Promise.all(rows.map((row) => sealOne(table, row)));
  }
  return sealOne(table, rows);
}

/**
 * Open rows read from a table with classified columns: decrypts every
 * enveloped `encryptedText()` value. Non-mutating; values that are not
 * envelopes (null, or pre-feature plaintext rows) pass through untouched.
 *
 * ```ts
 * const rows = await sdk.crypto.open(entries, await db.select().from(entries));
 * ```
 */
async function open<T extends Row>(table: object, rows: T): Promise<T>;
async function open<T extends Row>(table: object, rows: T[]): Promise<T[]>;
async function open(table: object, rows: Row | Row[]): Promise<Row | Row[]> {
  if (Array.isArray(rows)) {
    return Promise.all(rows.map((row) => openOne(table, row)));
  }
  return openOne(table, rows);
}
