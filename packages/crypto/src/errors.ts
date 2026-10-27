export type DecryptionFailure =
  /** Not an envelope this package wrote: wrong shape, version or lengths. */
  | 'malformed'
  /** Written under a key that is not in the key ring any more. */
  | 'unknown-key'
  /** The key ring has the key, but the value does not authenticate: a wrong key under that id, the wrong context, or a value that was altered. */
  | 'authentication-failed';

/**
 * A stored value could not be decrypted. It says why, never shows the value or a key, and
 * is the one error a caller needs to catch to degrade per value (show the field as
 * unavailable, ask for it again) instead of failing a whole page or request.
 */
export class DecryptionError extends Error {
  override name = 'DecryptionError';

  constructor(
    readonly reason: DecryptionFailure,
    /** The key id the value names, when it got far enough to say. Not secret. */
    readonly keyId?: string,
  ) {
    super(describe(reason, keyId));
  }
}

function describe(reason: DecryptionFailure, keyId: string | undefined): string {
  switch (reason) {
    case 'malformed':
      return 'A stored value could not be decrypted: it is not in the format field encryption writes.';
    case 'unknown-key':
      return `A stored value could not be decrypted: it was written under the key "${keyId ?? '?'}", which is not in the key ring any more.`;
    case 'authentication-failed':
      return `A stored value could not be decrypted: it did not authenticate under the key "${keyId ?? '?'}". The key or the context is wrong, or the value was altered.`;
  }
}

export function isDecryptionError(error: unknown): error is DecryptionError {
  return error instanceof DecryptionError;
}

/** The key ring text is wrong. Each problem names an entry by position and never shows a key. */
export class KeyRingError extends Error {
  override name = 'KeyRingError';

  constructor(readonly problems: readonly string[]) {
    super(`The key ring is invalid: ${problems.join('; ')}`);
  }
}
