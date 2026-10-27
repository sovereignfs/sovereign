import pg from 'pg';

/**
 * node-postgres returns `bigint` (and so `count(*)`) as a string. Every integer comes
 * back as a number instead, like on the other dialects, and a value that does not fit
 * exactly is an error rather than a silent rounding.
 */
export function parseInt8(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError('A bigint from PostgreSQL does not fit in a JavaScript number.');
  }
  return parsed;
}

const INT8 = 20;

export function createPool(connectionString: string, max: number): pg.Pool {
  return new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 10_000,
    types: {
      getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
        oid === INT8
          ? parseInt8
          : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
    },
  });
}

/** `?` placeholders become `$1`, `$2`, …; a `?` inside a quoted string or identifier is left alone. */
export function toPostgresPlaceholders(sql: string): string {
  let out = '';
  let n = 0;
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql.charAt(i);
    if (quote) {
      out += char;
      // A doubled quote is an escaped quote and stays inside the string.
      if (char === quote) {
        if (sql.charAt(i + 1) === quote) {
          out += quote;
          i += 1;
        } else quote = undefined;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      out += char;
    } else if (char === '?') {
      n += 1;
      out += `$${n}`;
    } else out += char;
  }
  return out;
}
