/**
 * Key release (RFC 0005 §4, core-app §5.7): how core's page hands an app's page the app key, through the address's fragment.
 *
 * - **Core's page seals** `{ app key, sub, client id, state, time, account signing key }` with HPKE to the public key the app's page
 *   made for this one request, with the client id, the return address and `state` as HPKE's `info`, and **signs** what it sealed with
 *   the account's signing key.
 * - **The app's page opens** it with the private key it kept, and refuses unless the client id and `state` inside are its own, the
 *   `sub` is its session's, the time is within two minutes, and the signature is by the signing key it remembers for this person (the
 *   first it is given otherwise).
 *
 * The answer is two base64url strings: `key` (the encapsulated key and the ciphertext, joined by `.`) and `sig`.
 */
import { fromBase64Url, source, toBase64Url, utf8 } from './bytes.js';
import { encodeFields, LABEL } from './fields.js';
import { open, seal, type KeyPair } from './hpke.js';
import { importSigningPublic, publicKeyFrom } from './identity.js';
import type { WebKey } from './password.js';
import { KEY_BYTES } from './records.js';

/** How long an answer is accepted after core made it. */
export const RELEASE_MAX_AGE_MS = 2 * 60 * 1000;
/** Bytes of a request's `state`. */
export const STATE_BYTES = 16;

export type ReleaseRefusal =
  | 'malformed'
  | 'unopenable'
  | 'other-app'
  | 'other-state'
  | 'other-person'
  | 'too-old'
  | 'signature';

export class ReleaseError extends Error {
  override name = 'ReleaseError';
  constructor(readonly reason: ReleaseRefusal) {
    super(`The key release was refused: ${reason}.`);
  }
}

/** What a release is for: the app, where the answer goes, and the request's `state`. */
export interface ReleaseTarget {
  readonly clientId: string;
  readonly returnTo: string;
  readonly state: string;
}

export interface ReleaseAnswer {
  /** base64url of the encapsulated key, `.`, base64url of the ciphertext. */
  readonly key: string;
  /** base64url of the account's Ed25519 signature over what was sealed. */
  readonly sig: string;
}

interface Payload {
  readonly v: 1;
  readonly appKey: string;
  readonly sub: string;
  readonly clientId: string;
  readonly state: string;
  readonly time: number;
  readonly signingPublic: string;
}

const infoOf = (target: ReleaseTarget) =>
  encodeFields(LABEL.keyRelease, target.clientId, target.returnTo, target.state);
const signedOf = (enc: Uint8Array, ciphertext: Uint8Array) =>
  encodeFields(LABEL.keyReleaseSignature, enc, ciphertext);

/** A `state` for a new request: 16 random bytes, base64url. */
export const newReleaseState = (): string =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(STATE_BYTES)));

/** Whether `text` is a `state` as `newReleaseState` makes them. */
export const isReleaseState = (text: unknown): text is string =>
  typeof text === 'string' && fromBase64Url(text)?.length === STATE_BYTES;

/** Core's side: seals the app key to the asking page's public key, and signs it with the account's signing key. */
export async function sealRelease(input: {
  readonly target: ReleaseTarget;
  /** The asking page's X25519 public key, base64url. */
  readonly request: string;
  readonly appKey: Uint8Array;
  readonly sub: string;
  readonly signingKey: WebKey;
  readonly signingPublic: string;
  readonly now?: number;
}): Promise<ReleaseAnswer> {
  if (input.appKey.length !== KEY_BYTES) throw new TypeError('An app key is 32 bytes.');
  const recipient = publicKeyFrom(input.request);
  const payload: Payload = {
    v: 1,
    appKey: toBase64Url(input.appKey),
    sub: input.sub,
    clientId: input.target.clientId,
    state: input.target.state,
    time: input.now ?? Date.now(),
    signingPublic: input.signingPublic,
  };
  const plaintext = utf8(JSON.stringify(payload));
  try {
    const { enc, ciphertext } = await seal(recipient, plaintext, { info: infoOf(input.target) });
    const sig = new Uint8Array(
      await crypto.subtle.sign('Ed25519', input.signingKey, source(signedOf(enc, ciphertext))),
    );
    return { key: `${toBase64Url(enc)}.${toBase64Url(ciphertext)}`, sig: toBase64Url(sig) };
  } finally {
    plaintext.fill(0);
  }
}

/**
 * The app's side: opens an answer with the private key kept for this request, and checks everything RFC 0005 §4 step 5 asks. Returns
 * the app key's bytes, which the caller keeps and overwrites, and the signing key to remember for this person.
 */
export async function openRelease(input: {
  readonly answer: ReleaseAnswer;
  readonly target: ReleaseTarget;
  readonly recipient: KeyPair | { privateKey: WebKey; publicKey: Uint8Array };
  /** The app's session's `sub`. */
  readonly sub: string;
  /** The signing key remembered for this person, base64url, when one is. */
  readonly signingPublic?: string | undefined;
  readonly now?: number;
}): Promise<{ appKey: Uint8Array; signingPublic: string }> {
  const [encText, cipherText, ...rest] = input.answer.key.split('.');
  const enc = encText ? fromBase64Url(encText) : undefined;
  const ciphertext = cipherText ? fromBase64Url(cipherText) : undefined;
  const sig = fromBase64Url(input.answer.sig);
  if (!enc || !ciphertext || rest.length > 0 || sig?.length !== 64) {
    throw new ReleaseError('malformed');
  }
  const publicKey =
    input.recipient.publicKey instanceof Uint8Array
      ? input.recipient.publicKey
      : new Uint8Array(await crypto.subtle.exportKey('raw', input.recipient.publicKey));

  let plaintext: Uint8Array;
  try {
    plaintext = await open(
      { privateKey: input.recipient.privateKey, publicKey },
      { enc, ciphertext },
      { info: infoOf(input.target) },
    );
  } catch {
    // Sealed to another request, or for another app, address or state: `info` differs, so it does not open.
    throw new ReleaseError('unopenable');
  }
  let payload: Payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext)) as Payload;
  } catch {
    throw new ReleaseError('malformed');
  } finally {
    plaintext.fill(0);
  }
  if (payload.v !== 1 || typeof payload.appKey !== 'string') throw new ReleaseError('malformed');
  if (payload.clientId !== input.target.clientId) throw new ReleaseError('other-app');
  if (payload.state !== input.target.state) throw new ReleaseError('other-state');
  if (payload.sub !== input.sub) throw new ReleaseError('other-person');
  const now = input.now ?? Date.now();
  if (
    typeof payload.time !== 'number' ||
    now - payload.time > RELEASE_MAX_AGE_MS ||
    payload.time - now > RELEASE_MAX_AGE_MS
  ) {
    throw new ReleaseError('too-old');
  }
  // The person's signing key: the one remembered, or, the first time, the one the answer names.
  const signingPublic = input.signingPublic ?? payload.signingPublic;
  let signer: WebKey;
  try {
    signer = await importSigningPublic(publicKeyFrom(signingPublic));
  } catch {
    throw new ReleaseError('signature');
  }
  const signed = await crypto.subtle.verify(
    'Ed25519',
    signer,
    source(sig),
    source(signedOf(enc, ciphertext)),
  );
  if (!signed || payload.signingPublic !== signingPublic) throw new ReleaseError('signature');
  const appKey = fromBase64Url(payload.appKey);
  if (appKey?.length !== KEY_BYTES) throw new ReleaseError('malformed');
  return { appKey, signingPublic };
}
