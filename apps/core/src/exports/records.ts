import type { Database } from '@sovereignfs/database';
import type { Exported } from './catalog';

const TIME = /(^at$|_at$)/;

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/** One stored value as JSON: bytes as base64url, a time as ISO 8601 in UTC (`contracts/export.md` §3), anything else as it is. */
export function exportValue(column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ArrayBuffer) return base64url(new Uint8Array(value));
  if (value instanceof Uint8Array) return base64url(value);
  if (typeof value === 'bigint') return Number(value);
  if (TIME.test(column)) {
    const number =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d+$/.test(value)
          ? Number(value)
          : undefined;
    if (number !== undefined) return new Date(number < 1e11 ? number * 1000 : number).toISOString();
  }
  return value;
}

/**
 * The rows of one table as an export carries them: only the columns decided, for everyone (`sub` undefined) or for one person.
 * Read in pages, so a large table is never held whole.
 */
export async function* exportRows(
  database: Database,
  table: string,
  decision: Exported,
  sub?: string,
): AsyncGenerator<Record<string, unknown>> {
  const columns =
    sub === undefined ? decision.columns : (decision.person?.columns ?? decision.columns);
  const where: string[] = [];
  const args: unknown[] = [];
  if (sub === undefined) {
    if (decision.where) where.push(`(${decision.where})`);
  } else {
    if (!decision.person) return;
    where.push(`${decision.person.by} = ?`);
    args.push(sub);
  }
  const order = columns.map((_, index) => index + 1).join(', ');
  const page = 500;
  for (let offset = 0; ; offset += page) {
    const sql = `select ${columns.join(', ')} from ${table}${where.length > 0 ? ` where ${where.join(' and ')}` : ''} order by ${order} limit ${page} offset ${offset}`;
    const { rows } = await database.run(sql, args);
    for (const row of rows) {
      const out: Record<string, unknown> = {};
      for (const column of columns)
        out[column] = exportValue(column, (row as Record<string, unknown>)[column]);
      yield out;
    }
    if (rows.length < page) return;
  }
}
