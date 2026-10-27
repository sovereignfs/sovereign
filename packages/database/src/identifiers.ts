/** PostgreSQL silently truncates an identifier longer than this many bytes. */
export const MAX_IDENTIFIER_BYTES = 63;

const SAFE = /^[a-z_][a-z0-9_]*$/;

/**
 * A table, column or index name that is the same on every dialect: lower-case letters,
 * digits and underscores, under 63 bytes. A longer name is truncated by PostgreSQL
 * without a word, and two names that differ only past the cut collide.
 */
export function assertIdentifier(name: string): void {
  const bytes = new TextEncoder().encode(name).length;
  if (bytes > MAX_IDENTIFIER_BYTES) {
    throw new Error(
      `The identifier "${name}" is ${bytes} bytes; PostgreSQL truncates anything over ${MAX_IDENTIFIER_BYTES}.`,
    );
  }
  if (!SAFE.test(name)) {
    throw new Error(
      `The identifier "${name}" must be lower-case letters, digits and underscores, starting with a letter or underscore.`,
    );
  }
}

/**
 * A database integer as a JavaScript number. `run` already returns numbers on every
 * dialect; this is for a value that reached you another way (a raw driver, a `bigint`
 * column read through a different layer). Throws when digits would be lost.
 */
export function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'bigint' || typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && String(value).trim() !== '') return parsed;
  }
  throw new RangeError('The value is not an integer that fits in a JavaScript number.');
}
