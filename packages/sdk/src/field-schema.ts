import type { SensitivityClass } from './types';

/**
 * Drizzle-free half of the field-encryption schema helpers (RFC 0092, epic
 * task 8.33): the metadata brand, its types, and table introspection. Lives
 * apart from `./drizzle` (which imports `drizzle-orm` to build the actual
 * column types) so the main SDK barrel — which must not depend on
 * drizzle-orm — can use discovery inside `sdk.crypto.seal()`/`open()`.
 * Introspection reads drizzle's *global registry* symbol
 * (`Symbol.for('drizzle:Columns')`), which requires no import.
 */

/** Brand carrying a column's field-encryption metadata, attached to its `toDriver`. */
export const FIELD_META: unique symbol = Symbol.for('sovereign:fieldMeta');

export interface EncryptedColumnMeta {
  kind: 'encrypted';
  sensitivity: SensitivityClass;
}

export interface BlindIndexColumnMeta {
  kind: 'blindIndex';
  /** The JS property key (in the same table object) of the encrypted column this indexes. */
  source: string;
}

export type FieldColumnMeta = EncryptedColumnMeta | BlindIndexColumnMeta;

export type BrandedMapper = ((value: unknown) => unknown) & { [FIELD_META]?: FieldColumnMeta };

/** One discovered classified column of a table. */
export interface DiscoveredFieldColumn {
  /** The JS property key in the table object / row objects. */
  key: string;
  /** The database column name (used as the encryption `context` binding). */
  columnName: string;
  meta: FieldColumnMeta;
}

/** Discover the classified columns of a drizzle table (empty for tables without any). */
export function getFieldColumns(table: object): DiscoveredFieldColumn[] {
  const columns = (table as Record<symbol, Record<string, unknown> | undefined>)[
    Symbol.for('drizzle:Columns')
  ];
  if (!columns) return [];
  const found: DiscoveredFieldColumn[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const mapTo = (column as { mapTo?: BrandedMapper } | undefined)?.mapTo;
    const meta = mapTo?.[FIELD_META];
    if (meta) {
      const columnName = (column as { name?: string }).name ?? key;
      found.push({ key, columnName, meta });
    }
  }
  return found;
}

/**
 * Serializable descriptor of one classified table (RFC 0092 gate B) — what
 * `sdk.crypto.registerTables()` persists so the CLI re-seal walker
 * (`sv db encrypt-fields`, `sv keys rotate-blind-index`) can operate on
 * plugin tables from a process where plugin code is not loaded.
 */
export interface FieldTableMetadata {
  tableName: string;
  /** Database column names of the primary key — the walker's checkpoint/batch cursor. */
  pkColumns: string[];
  fields: DiscoveredFieldColumn[];
}

/** Extract a table's persistable metadata. Throws if the table has no classified columns or no PK. */
export function getTableFieldMetadata(table: object): FieldTableMetadata {
  const t = table as Record<symbol, unknown>;
  const tableName = t[Symbol.for('drizzle:Name')] as string | undefined;
  if (!tableName) {
    throw new Error('sdk.crypto.registerTables: not a drizzle table object.');
  }
  const fields = getFieldColumns(table);
  if (fields.length === 0) {
    throw new Error(
      `sdk.crypto.registerTables: table "${tableName}" has no encryptedText()/blindIndex() columns.`,
    );
  }
  const columns = (t[Symbol.for('drizzle:Columns')] ?? {}) as Record<
    string,
    { name?: string; primary?: boolean } | undefined
  >;
  const pkColumns = Object.values(columns)
    .filter((c) => c?.primary)
    .map((c) => c?.name)
    .filter((n): n is string => typeof n === 'string');
  if (pkColumns.length === 0) {
    throw new Error(
      `sdk.crypto.registerTables: table "${tableName}" needs a primary key — the re-seal ` +
        'walker uses it as its resumable cursor.',
    );
  }
  return { tableName, pkColumns, fields };
}
