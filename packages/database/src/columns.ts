import { bigint, customType, type PgBigInt53BuilderInitial } from 'drizzle-orm/pg-core';
import { blob, integer, type SQLiteIntegerBuilderInitial } from 'drizzle-orm/sqlite-core';

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

/**
 * Binary data (an image), as a `Buffer` on both dialects: SQLite's `blob` and PostgreSQL's `bytea`.
 *
 * Reading is not the same everywhere: libSQL hands a blob back as an `ArrayBuffer` and node-postgres
 * hands `bytea` back as a `Buffer`, so a raw read converts with `toBuffer`.
 */
export function sqliteBytes<Name extends string>(name: Name) {
  return blob(name, { mode: 'buffer' });
}

export const postgresBytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/** A binary value read with a raw query, as a `Buffer`, whichever driver produced it. */
export function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value))
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('A binary column came back as something that is not bytes.');
}
