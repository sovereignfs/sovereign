import { decodeBase64 } from './encoding.js';
import { KeyRingError } from './errors.js';

/** AES-256 takes a 256-bit key. */
export const KEY_BYTES = 32;

/** The longest key ring text accepted; a ring is a handful of short entries. */
const MAX_RING_LENGTH = 4096;

/** A key id: short, lower-case, and free of the characters an envelope uses to separate fields. */
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export type FieldKey = { readonly id: string; readonly material: Buffer };

export type KeyRing = {
  /** The first entry: new values are encrypted with it. */
  readonly current: FieldKey;
  /** Every entry by id: any of them can decrypt. */
  readonly byId: ReadonlyMap<string, FieldKey>;
};

/**
 * Reads a key ring: comma-separated `id:key` entries, **newest first**. Each key is 32
 * random bytes, base64 or base64url (`openssl rand -base64 32`).
 *
 *   k2:Zm9vYmFy…=,k1:b2xkb2xk…=
 *
 * To rotate, put a new entry in front and keep the old ones for as long as stored values
 * written under them remain. Every problem is reported at once, by entry position; none
 * shows an id's key, because a mistyped entry may be a key itself.
 */
export function parseKeyRing(raw: string): KeyRing {
  if (raw.length > MAX_RING_LENGTH) throw new KeyRingError(['it is longer than any real key ring']);

  const problems: string[] = [];
  const keys: FieldKey[] = [];
  const seen = new Map<string, number>();

  raw.split(',').forEach((entry, index) => {
    const position = index + 1;
    const text = entry.trim();
    if (text === '') {
      problems.push(`entry ${position} is empty`);
      return;
    }
    const colon = text.indexOf(':');
    if (colon === -1) {
      problems.push(`entry ${position} must be id:key`);
      return;
    }
    const id = text.slice(0, colon);
    const encoded = text.slice(colon + 1);

    let valid = true;
    if (!KEY_ID.test(id)) {
      problems.push(
        `entry ${position} has an id that is not 1-32 lower-case letters, digits, "-" or "_"`,
      );
      valid = false;
    }
    const material = decodeBase64(encoded);
    if (material === undefined) {
      problems.push(`entry ${position} has a key that is not valid base64`);
      valid = false;
    } else if (material.length !== KEY_BYTES) {
      problems.push(`entry ${position} has a key that is not ${KEY_BYTES} bytes`);
      valid = false;
    }
    const earlier = seen.get(id);
    if (valid && earlier !== undefined) {
      problems.push(`entries ${earlier} and ${position} use the same id`);
      valid = false;
    }
    if (valid && material !== undefined) {
      seen.set(id, position);
      keys.push({ id, material });
    }
  });

  if (problems.length > 0) throw new KeyRingError(problems);
  const [current] = keys;
  if (current === undefined) throw new KeyRingError(['it has no keys']);
  return { current, byId: new Map(keys.map((key) => [key.id, key])) };
}
