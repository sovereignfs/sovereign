import { bigint, type PgBigInt53BuilderInitial } from 'drizzle-orm/pg-core';
import { integer, type SQLiteIntegerBuilderInitial } from 'drizzle-orm/sqlite-core';

/**
 * A millisecond timestamp, as the same JavaScript `number` on every dialect.
 *
 * On PostgreSQL it is `bigint`: a 13-digit millisecond value overflows the 32-bit
 * `integer`. SQLite's `integer` already holds 64 bits.
 */
export function sqliteTimestampMs<Name extends string>(
  name: Name,
): SQLiteIntegerBuilderInitial<Name> {
  return integer(name);
}

export function postgresTimestampMs<Name extends string>(
  name: Name,
): PgBigInt53BuilderInitial<Name> {
  return bigint(name, { mode: 'number' });
}
