import {
  FieldEncryptionConfigError,
  clearResealCheckpoint,
  getPlatformDb,
  getResealCheckpoint,
  listFieldTableRegistrations,
  listOpenHmacRotations,
  upsertResealCheckpoint,
  type FieldTableRegistrationRow,
  type PlatformDb,
} from '@sovereignfs/db';
import { sql } from 'drizzle-orm';
import type { FieldTableMetadata, SensitivityClass } from '@sovereignfs/sdk';
import { FIELD_DATA_PREFIX, FIELD_PASSTHROUGH_PREFIX } from '@sovereignfs/sdk';
import { decryptFieldValue, encryptFieldValue, type ResolvedCryptoContext } from './field-crypto';
import { getFieldHmacs } from './field-encryption-keys';

/**
 * The generic re-seal walker (RFC 0092 gate B) — the shared machinery under
 * `sv db encrypt-fields` (backfill) and `sv keys rotate-blind-index`
 * (index re-seal). Walks every persisted classified-table registration
 * (written by `sdk.crypto.registerTables()`), batch by batch, ordered by the
 * table's primary key, checkpointing progress per (job × plugin × table) so
 * an interrupted run resumes instead of restarting.
 *
 * Deliberately runs on plain SQL built from persisted metadata — no plugin
 * code is loaded, so operator tooling works from any process. Identifier
 * names come from the plugin's own registered schema metadata and are always
 * double-quoted; values travel as bound parameters.
 *
 * Limitations (documented): composite-primary-key tables are skipped with a
 * warning (the cursor is single-column in v1); tables never registered are
 * invisible to the walker — both are named in the tool's output rather than
 * silently ignored.
 */

const BATCH_SIZE = 100;

export type ResealJob = 'backfill' | 'rotate-index';

export interface TableResealResult {
  pluginId: string;
  tableName: string;
  scanned: number;
  updated: number;
  skippedReason?: string;
}

export interface ResealSummary {
  tables: TableResealResult[];
  /** Registrations that could not be walked (composite pk, bad metadata). */
  skipped: TableResealResult[];
}

function q(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new FieldEncryptionConfigError(
      `Unsafe identifier in table registration: "${identifier}".`,
    );
  }
  return `"${identifier}"`;
}

/**
 * Build one multi-row `UPDATE` for a group of rows that all need the exact
 * same set of columns re-sealed. Portable across both dialects via `CASE
 * <pk> WHEN ... THEN ... END` per column and a `WHERE <pk> IN (...)` — no
 * dialect-specific SQL, unlike a `VALUES (...) AS v(...)` join. Identifiers
 * are validated via `q()`; every value (pk or column) travels as a bound
 * parameter via the drizzle `sql` template, exactly as the prior per-row
 * statement did.
 */
function buildGroupUpdate(
  tableName: string,
  pk: string,
  columns: string[],
  entries: { pkValue: unknown; updates: Record<string, string | null> }[],
) {
  const pkFragment = sql.raw(q(pk));
  const setClauses = columns.map((col) => {
    const whens = entries.map((e) => sql`WHEN ${e.pkValue} THEN ${e.updates[col] ?? null}`);
    return sql`${sql.raw(q(col))} = CASE ${pkFragment} ${sql.join(whens, sql.raw(' '))} END`;
  });
  const pkValues = entries.map((e) => sql`${e.pkValue}`);
  return sql`UPDATE ${sql.raw(q(tableName))} SET ${sql.join(setClauses, sql.raw(', '))} WHERE ${pkFragment} IN (${sql.join(pkValues, sql.raw(', '))})`;
}

function decodePassthrough(envelope: string): string {
  return Buffer.from(envelope.slice(FIELD_PASSTHROUGH_PREFIX.length + 1), 'base64url').toString(
    'utf8',
  );
}

/** Read one row's plaintext for an encrypted column value (svf1 → decrypt, svf0 → decode, bare → as-is). */
async function plaintextOf(
  value: string,
  columnName: string,
  ctx: ResolvedCryptoContext,
): Promise<string> {
  if (value.startsWith(`${FIELD_PASSTHROUGH_PREFIX}:`)) return decodePassthrough(value);
  if (value.startsWith(`${FIELD_DATA_PREFIX}:`)) {
    return decryptFieldValue(value, { context: columnName }, ctx);
  }
  return value; // pre-feature plaintext
}

type RowTransform = (
  row: Record<string, unknown>,
  meta: FieldTableMetadata,
  ctx: ResolvedCryptoContext,
) => Promise<Record<string, string | null> | null>;

/**
 * Backfill transform (`sv db encrypt-fields`): plaintext or `svf0` values in
 * an encrypted column whose class the policy now enables become `svf1`
 * ciphertext; blind indexes are recomputed whenever their source produced a
 * new value (or is present with a stale/missing index). Values already
 * `svf1`, or in classes the policy leaves off, are untouched.
 */
const backfillTransform: RowTransform = async (row, meta, ctx) => {
  const updates: Record<string, string | null> = {};
  const plaintexts = new Map<string, string>();

  for (const field of meta.fields) {
    if (field.meta.kind !== 'encrypted') continue;
    const value = row[field.columnName];
    if (value === null || value === undefined || typeof value !== 'string') continue;
    const plaintext = await plaintextOf(value, field.columnName, ctx);
    plaintexts.set(field.key, plaintext);
    const resealed = await encryptFieldValue(
      plaintext,
      { sensitivity: field.meta.sensitivity as SensitivityClass, context: field.columnName },
      ctx,
    );
    // encryptFieldValue consults the policy: enabled class → svf1, disabled →
    // svf0. Only write when the stored representation class actually changes
    // (plaintext→envelope, or svf0→svf1); fresh svf1 over old svf1 is skipped
    // so backfill is idempotent and cheap on already-sealed data.
    const storedKind = value.startsWith(`${FIELD_DATA_PREFIX}:`)
      ? 'svf1'
      : value.startsWith(`${FIELD_PASSTHROUGH_PREFIX}:`)
        ? 'svf0'
        : 'plain';
    const newKind = resealed.startsWith(`${FIELD_DATA_PREFIX}:`) ? 'svf1' : 'svf0';
    if (storedKind === 'plain' || (storedKind === 'svf0' && newKind === 'svf1')) {
      updates[field.columnName] = resealed;
    }
  }

  for (const field of meta.fields) {
    if (field.meta.kind !== 'blindIndex') continue;
    const bidxMeta = field.meta;
    const source = meta.fields.find(
      (f) => f.key === bidxMeta.source && f.meta.kind === 'encrypted',
    );
    if (!source || source.meta.kind !== 'encrypted') continue;
    const sourceValue = row[source.columnName];
    if (sourceValue === null || sourceValue === undefined) continue;
    const plaintext =
      plaintexts.get(source.key) ??
      (typeof sourceValue === 'string'
        ? await plaintextOf(sourceValue, source.columnName, ctx)
        : undefined);
    if (plaintext === undefined) continue;
    const hmacs = await getFieldHmacs(ctx.pluginId, source.meta.sensitivity);
    const expected = hmacs.current(plaintext);
    if (row[field.columnName] !== expected) {
      updates[field.columnName] = expected;
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
};

/**
 * Rotation transform (`sv keys rotate-blind-index`): recompute every blind
 * index from its decrypted source under the *current* HMAC key. Idempotent —
 * rows already re-sealed compare equal and are skipped.
 */
const rotateIndexTransform: RowTransform = async (row, meta, ctx) => {
  const updates: Record<string, string | null> = {};
  for (const field of meta.fields) {
    if (field.meta.kind !== 'blindIndex') continue;
    const bidxMeta = field.meta;
    const source = meta.fields.find(
      (f) => f.key === bidxMeta.source && f.meta.kind === 'encrypted',
    );
    if (!source || source.meta.kind !== 'encrypted') continue;
    const sourceValue = row[source.columnName];
    if (sourceValue === null || sourceValue === undefined || typeof sourceValue !== 'string') {
      continue;
    }
    const plaintext = await plaintextOf(sourceValue, source.columnName, ctx);
    const hmacs = await getFieldHmacs(ctx.pluginId, source.meta.sensitivity);
    const expected = hmacs.current(plaintext);
    if (row[field.columnName] !== expected) {
      updates[field.columnName] = expected;
    }
  }
  return Object.keys(updates).length > 0 ? updates : null;
};

const TRANSFORMS: Record<ResealJob, RowTransform> = {
  backfill: backfillTransform,
  'rotate-index': rotateIndexTransform,
};

async function walkOneTable(
  pdb: PlatformDb,
  job: ResealJob,
  registration: FieldTableRegistrationRow,
  onProgress?: (message: string) => void,
): Promise<TableResealResult> {
  const result: TableResealResult = {
    pluginId: registration.pluginId,
    tableName: registration.tableName,
    scanned: 0,
    updated: 0,
  };

  let meta: FieldTableMetadata;
  try {
    meta = JSON.parse(registration.metadata) as FieldTableMetadata;
  } catch {
    result.skippedReason = 'unparseable registration metadata';
    return result;
  }
  if (!Array.isArray(meta.pkColumns) || meta.pkColumns.length !== 1) {
    result.skippedReason = `composite or missing primary key (${String(meta.pkColumns?.length ?? 0)} columns) — the walker cursor is single-column`;
    return result;
  }
  const pk = meta.pkColumns[0] as string;
  const ctx: ResolvedCryptoContext = { tenantId: 'default', pluginId: registration.pluginId };
  const transform = TRANSFORMS[job];

  const selectCols = [pk, ...meta.fields.map((f) => f.columnName).filter((c) => c !== pk)].map(q);

  let cursor = await getResealCheckpoint(pdb, job, registration.pluginId, registration.tableName);
  if (cursor !== undefined) {
    onProgress?.(`${registration.tableName}: resuming from checkpoint`);
  }

  // Identifiers are validated (q) and injected raw; every VALUE travels as a
  // bound parameter via the drizzle sql template — no manual escaping.
  const selectFragment = sql.raw(`SELECT ${selectCols.join(', ')} FROM ${q(meta.tableName)}`);
  const pkFragment = sql.raw(q(pk));
  const limitFragment = sql.raw(String(BATCH_SIZE));

  for (;;) {
    const query =
      cursor === undefined
        ? sql`${selectFragment} ORDER BY ${pkFragment} LIMIT ${limitFragment}`
        : sql`${selectFragment} WHERE ${pkFragment} > ${cursor} ORDER BY ${pkFragment} LIMIT ${limitFragment}`;
    const rows =
      pdb.dialect === 'sqlite'
        ? await pdb.db.all<Record<string, unknown>>(query)
        : ((await pdb.db.execute(query)) as { rows: Record<string, unknown>[] }).rows;

    if (rows.length === 0) break;

    // transform() is CPU/crypto-bound work on already-fetched rows, not a
    // round trip -- stays a per-row call. Collect every row's result first,
    // so the writes below can be grouped and batched instead of one round
    // trip per row.
    const pending: { pkValue: unknown; updates: Record<string, string | null> }[] = [];
    for (const row of rows) {
      result.scanned += 1;
      const updates = await transform(row, meta, ctx);
      if (updates) {
        pending.push({ pkValue: row[pk], updates });
        result.updated += 1;
      }
      cursor = String(row[pk]);
    }

    // Rows needing different sets of resealed columns can't share one
    // multi-row UPDATE (backfillTransform/rotateIndexTransform each produce
    // a different changed-column set per row) -- group by the exact shape
    // first, then flush one statement per group.
    const groups = new Map<
      string,
      { columns: string[]; entries: { pkValue: unknown; updates: Record<string, string | null> }[] }
    >();
    for (const entry of pending) {
      const columns = Object.keys(entry.updates).sort();
      const key = columns.join(' ');
      const group = groups.get(key);
      if (group) group.entries.push(entry);
      else groups.set(key, { columns, entries: [entry] });
    }

    for (const group of groups.values()) {
      const update = buildGroupUpdate(meta.tableName, pk, group.columns, group.entries);
      if (pdb.dialect === 'sqlite') await pdb.db.run(update);
      else await pdb.db.execute(update);
    }

    await upsertResealCheckpoint(
      pdb,
      job,
      registration.pluginId,
      registration.tableName,
      cursor as string,
    );
    onProgress?.(
      `${registration.tableName}: ${String(result.scanned)} scanned, ${String(result.updated)} updated`,
    );
    if (rows.length < BATCH_SIZE) break;
  }

  await clearResealCheckpoint(pdb, job, registration.pluginId, registration.tableName);
  return result;
}

/**
 * Walk every registered classified table (optionally scoped to one plugin)
 * with the given job's transform. Resumable; each table's checkpoint clears
 * on clean completion. Skipped registrations are reported, never silent.
 */
export async function runReseal(
  pdb: PlatformDb,
  job: ResealJob,
  options: { pluginId?: string; onProgress?: (message: string) => void } = {},
): Promise<ResealSummary> {
  const registrations = await listFieldTableRegistrations(pdb, options.pluginId);
  const summary: ResealSummary = { tables: [], skipped: [] };
  for (const registration of registrations) {
    const result = await walkOneTable(pdb, job, registration, options.onProgress);
    (result.skippedReason ? summary.skipped : summary.tables).push(result);
  }
  return summary;
}

const STALE_ROTATION_DAYS = 7;

/**
 * Boot check (RFC 0092 gate B "never indefinite"): log a warning for any
 * blind-index rotation window older than 7 days, so a started-but-abandoned
 * rotation surfaces on every boot instead of quietly living forever.
 * Returns the warning strings (also handed to the caller for Console
 * visibility via the plugin-compat warning channel).
 */
export async function warnStaleHmacRotations(): Promise<string[]> {
  const pdb = await getPlatformDb();
  const open = await listOpenHmacRotations(pdb);
  const now = Math.floor(Date.now() / 1000);
  const warnings: string[] = [];
  for (const row of open) {
    const ageDays = (now - (row.hmacRotationStartedAt ?? now)) / 86400;
    if (ageDays >= STALE_ROTATION_DAYS) {
      warnings.push(
        `Blind-index rotation for ${row.pluginId} / ${row.class} has been open for ` +
          `${ageDays.toFixed(0)} days. Finish it: sv keys rotate-blind-index ` +
          `--plugin ${row.pluginId} --class ${row.class}`,
      );
    }
  }
  return warnings;
}
