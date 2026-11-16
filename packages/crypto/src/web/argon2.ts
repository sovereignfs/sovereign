/**
 * Argon2id, from libsodium's WebAssembly build (`libsodium-wrappers-sumo`): the one primitive of RFC 0005 that WebCrypto does not
 * have. Why libsodium, and what its audit did and did not cover, is in the package's README.
 *
 * libsodium fixes two of Argon2id's parameters: one lane (RFC 0005 asks for one) and a 16-byte salt. It is loaded only when a
 * derivation is first asked for, so code that only checks a value's shape never loads it.
 */

/** What an Argon2id run costs: the memory it fills and the passes it makes over it. */
export interface Argon2Cost {
  /** Bytes of memory, a multiple of 1024. */
  readonly memoryBytes: number;
  /** Passes over that memory. */
  readonly passes: number;
}

/** The smallest cost RFC 0005 §1.4 allows, OWASP's minimum: 19 MiB and 2 passes. */
export const MINIMUM_COST: Argon2Cost = { memoryBytes: 19 * 1024 * 1024, passes: 2 };

/** libsodium's salt length for Argon2id. */
export const ARGON2_SALT_BYTES = 16;

type Sodium = typeof import('libsodium-wrappers-sumo').default;

let loading: Promise<Sodium> | undefined;

/** libsodium, ready to use. One load for the page, however many derivations ask. */
function sodium(): Promise<Sodium> {
  loading ??= import('libsodium-wrappers-sumo').then(async (module) => {
    await module.default.ready;
    return module.default;
  });
  return loading;
}

/**
 * Argon2id version 1.3, one lane, 32 bytes out. The caller owns the result and SHOULD overwrite it with zeros once it has made
 * what it needs from it.
 */
export async function argon2id(
  password: Uint8Array,
  salt: Uint8Array,
  cost: Argon2Cost,
): Promise<Uint8Array> {
  if (salt.length !== ARGON2_SALT_BYTES) {
    throw new TypeError(`An Argon2id salt is ${ARGON2_SALT_BYTES} bytes, not ${salt.length}.`);
  }
  if (cost.memoryBytes % 1024 !== 0 || cost.memoryBytes < 8192 || cost.passes < 1) {
    throw new TypeError('An Argon2id cost needs at least 8 KiB, in whole KiB, and one pass.');
  }
  const lib = await sodium();
  return lib.crypto_pwhash(
    32,
    password,
    salt,
    cost.passes,
    cost.memoryBytes,
    lib.crypto_pwhash_ALG_ARGON2ID13,
  );
}
