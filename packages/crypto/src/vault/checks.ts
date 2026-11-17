/**
 * What a vault checks before it stores anything, the same for core's vault (core-app §5.3) and an app's own (sdk §9.5): a record is a
 * JSON object of a few kilobytes at most, a salt or a key is 32 bytes of base64url, a way in is one the host keeps. Neither opens a
 * record; these only keep what is not a record out.
 */

/** Why a vault refused: keys there already, none set up, or something that is not a record. */
export class VaultError extends Error {
  override name = 'VaultError';
  constructor(
    readonly code: 'exists' | 'not-set-up' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/** A way into the account key, as a vault stores it: which way, which one of that way, the record as JSON, a passkey's salt. */
export interface StoredWayIn {
  readonly way: string;
  readonly id: string;
  readonly record: string;
  readonly prfSalt?: string | undefined;
}

/** A record is JSON of at most a few kilobytes: anything else is refused before it is stored. */
export function checkRecord(text: unknown, what: string): string {
  if (typeof text !== 'string' || text.length === 0 || text.length > 8192) {
    throw new VaultError('invalid', `${what} is not a record.`);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
  } catch {
    throw new VaultError('invalid', `${what} is not a record.`);
  }
  return text;
}

/** 32 bytes of unpadded base64url: a salt, or a public key. */
export function checkBase64Url32(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new VaultError('invalid', `${what} is not 32 bytes of base64url.`);
  }
  return value;
}

/** A signature: 64 bytes of unpadded base64url. */
export function checkSignature(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value)) {
    throw new VaultError('invalid', 'That is not a signature.');
  }
  return value;
}

/** A way in the host keeps, with a usable id, its record, and a passkey's salt. */
export function checkWayIn<Way extends string>(
  wayIn: StoredWayIn,
  ways: ReadonlySet<Way>,
): StoredWayIn & { readonly way: Way } {
  if (!ways.has(wayIn.way as Way)) throw new VaultError('invalid', 'That is not a way in.');
  if (typeof wayIn.id !== 'string' || wayIn.id.length > 512) {
    throw new VaultError('invalid', 'That way in has no usable id.');
  }
  if (wayIn.way === 'passkey' && !wayIn.id) {
    throw new VaultError('invalid', 'A passkey way in names its passkey.');
  }
  return {
    way: wayIn.way as Way,
    id: wayIn.id,
    record: checkRecord(wayIn.record, 'The way in'),
    ...(wayIn.way === 'passkey'
      ? { prfSalt: checkBase64Url32(wayIn.prfSalt, 'The passkey salt') }
      : {}),
  };
}

/** An app's client id, as the vault keys its records by it. */
export function checkClientId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 255) {
    throw new VaultError('invalid', 'That is not an app.');
  }
  return value;
}
