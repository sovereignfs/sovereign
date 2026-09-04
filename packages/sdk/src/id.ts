/**
 * Random ID generation. Pure computation — no platform infrastructure
 * involved, so unlike most SDK surfaces this has no host indirection: it
 * runs entirely inside `@sovereignfs/sdk` using the standard Web Crypto API
 * (`crypto.randomUUID()` / `crypto.getRandomValues()`), available in Node
 * 20+, browsers, and edge runtimes alike. Plugins previously had to add a
 * third-party dependency (typically `nanoid`) and carry it through the
 * manifest dependency-hoisting pipeline for this.
 */

/**
 * URL-safe, 64-character alphabet (`A-Z`, `a-z`, `0-9`, `-`, `_`). 64 is a
 * power of two, so masking a random byte with `& 63` maps uniformly onto the
 * alphabet with no modulo bias and no rejection sampling needed.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Matches nanoid's own default length — enough collision resistance for typical ID use. */
const DEFAULT_SHORT_ID_SIZE = 21;

export const id = {
  /** A random RFC 4122 v4 UUID, e.g. `"e77e1c53-...-9a2e"`. */
  uuid(): string {
    return crypto.randomUUID();
  },
  /**
   * A random, URL-safe short ID (`A-Za-z0-9-_`), `size` characters long
   * (default 21, matching nanoid's own default). Cryptographically random,
   * unbiased.
   */
  short(size: number = DEFAULT_SHORT_ID_SIZE): string {
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error(`@sovereignfs/sdk: id.short() size must be a positive integer, got ${size}`);
    }
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    let out = '';
    for (const byte of bytes) {
      out += ALPHABET.charAt(byte & 63);
    }
    return out;
  },
};
