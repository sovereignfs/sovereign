import { customType } from 'drizzle-orm/sqlite-core';
import type { SensitivityClass } from './types';
import { FIELD_DATA_PREFIX, FIELD_PASSTHROUGH_PREFIX } from './types';
import {
  FIELD_META,
  type BlindIndexColumnMeta,
  type BrandedMapper,
  type EncryptedColumnMeta,
} from './field-schema';

/**
 * Declarative schema helpers for app-level field encryption (RFC 0092, epic
 * task 8.33 — workstream 0011 leg 3). Import from `@sovereignfs/sdk/drizzle`
 * — a dedicated subpath so the main SDK barrel stays free of a `drizzle-orm`
 * dependency (it's a peer dependency here; every plugin with a schema
 * already has it).
 *
 * ```ts
 * import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
 * import { encryptedText, blindIndex } from '@sovereignfs/sdk/drizzle';
 *
 * export const entries = sqliteTable('entries', {
 *   id: text('id').primaryKey(),
 *   tenantId: text('tenant_id').notNull(),
 *   loggedAt: integer('logged_at').notNull(), // plaintext metadata — filter/sort freely
 *   notes: encryptedText('notes', { sensitivity: 'health' }),
 *   notesIdx: blindIndex('notes_bidx', { source: 'notes' }),
 * });
 * ```
 *
 * The helpers are **metadata + enforcement only — they perform no crypto.**
 * Values are encrypted/decrypted by `sdk.crypto.seal()` / `sdk.crypto.open()`
 * (one mechanical call per statement, zero per-field code); classification
 * lives here, in the schema, where reviewers and the platform can see it.
 *
 * **The tripwire:** an `encryptedText` column's `toDriver` runs synchronously
 * inside drizzle on every write and rejects any value that isn't a sealed
 * envelope (`svf1:`/`svf0:`). A forgotten `seal()` therefore cannot silently
 * write plaintext into a classified column — it throws at write time, on
 * every write route that goes through the column mapper. (Raw ``sql`` ``
 * statements bypass column mappers entirely and are the documented
 * exception — see `docs/plugin-development.md`.)
 *
 * Dialect note: plugins query through their sqlite-core schema regardless of
 * the live dialect (see `docs/plugin-database.md`) — these helpers are
 * sqlite-core on purpose. The Postgres *migration-generation* twin schema
 * file should declare the same columns as plain `text(...)`; it is never
 * queried through, so it needs neither metadata nor the tripwire.
 */

function isEnvelope(value: string): boolean {
  return (
    value.startsWith(`${FIELD_DATA_PREFIX}:`) || value.startsWith(`${FIELD_PASSTHROUGH_PREFIX}:`)
  );
}

/**
 * A classified text column (RFC 0092). Stored value is always a sealed
 * envelope — reads return the envelope; decrypt via `sdk.crypto.open()`.
 * Whether the class is actually encrypted is the operator's policy decision;
 * plugin code is identical either way.
 */
export function encryptedText(name: string, options: { sensitivity: SensitivityClass }) {
  const meta: EncryptedColumnMeta = { kind: 'encrypted', sensitivity: options.sensitivity };
  const toDriver: BrandedMapper = (value: unknown) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string' || !isEnvelope(value)) {
      throw new Error(
        `Classified column "${name}" (sensitivity: ${options.sensitivity}) received an ` +
          'unsealed value. Run the row through sdk.crypto.seal(table, row) before writing — ' +
          'plaintext never goes into a classified column.',
      );
    }
    return value;
  };
  toDriver[FIELD_META] = meta;
  return customType<{ data: string; driverData: string }>({
    dataType: () => 'text',
    toDriver: toDriver as (value: string) => string,
    fromDriver: (value: string) => value,
  })(name);
}

/**
 * The HMAC-SHA256 blind-index companion of an `encryptedText` column —
 * enables exact-match lookups over encrypted data (`WHERE notes_bidx = …`
 * with `await sdk.crypto.hashField(term, { sensitivity })`). Maintained
 * automatically by `sdk.crypto.seal()` whenever the source column is present
 * in the row. Exact match only — no LIKE, no ranges, no ordering.
 */
export function blindIndex(name: string, options: { source: string }) {
  const meta: BlindIndexColumnMeta = { kind: 'blindIndex', source: options.source };
  const toDriver: BrandedMapper = (value: unknown) => value;
  toDriver[FIELD_META] = meta;
  return customType<{ data: string; driverData: string }>({
    dataType: () => 'text',
    toDriver: toDriver as (value: string) => string,
    fromDriver: (value: string) => value,
  })(name);
}

export {
  FIELD_META,
  getFieldColumns,
  type BlindIndexColumnMeta,
  type DiscoveredFieldColumn,
  type EncryptedColumnMeta,
  type FieldColumnMeta,
} from './field-schema';
