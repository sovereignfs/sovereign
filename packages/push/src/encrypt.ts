import { createCipheriv, createECDH, createHmac, randomBytes } from 'node:crypto';
import { concat, utf8 } from './bytes.js';
import { isPrivateScalar, publicPointOf } from './keys.js';

/**
 * A push message encrypted to one browser (RFC 8291, the `aes128gcm` content coding of RFC 8188), so the push service carries it
 * and cannot read it. One record, as RFC 8291 §4 requires: the header (salt, record size, the sender's one-time public key), then
 * the message with the final-record delimiter `0x02`, sealed with AES-128-GCM.
 */

/** The record size written in the header. One record holds the whole message, which is far smaller. */
export const RECORD_SIZE = 4096;
/** The most a message may be (RFC 8291 §4: 4096 less the header's 86 bytes, the delimiter and the 16-byte tag). */
export const MAX_PLAINTEXT = 3993;

/** The browser's side of a subscription, as bytes. */
export interface Receiver {
  /** The browser's public key (`p256dh`): an uncompressed P-256 point, 65 bytes. */
  readonly publicKey: Uint8Array;
  /** The subscription's authentication secret (`auth`), 16 bytes. */
  readonly authSecret: Uint8Array;
}

/** What RFC 8291 Appendix A lists, for a test to compare step by step. */
export interface Intermediates {
  readonly ecdhSecret: Uint8Array;
  readonly ikm: Uint8Array;
  readonly prk: Uint8Array;
  readonly cek: Uint8Array;
  readonly nonce: Uint8Array;
  readonly header: Uint8Array;
}

export class EncryptionError extends Error {
  override readonly name = 'EncryptionError';
}

const hmac = (key: Uint8Array, data: Uint8Array) =>
  new Uint8Array(createHmac('sha256', key).update(data).digest());

/** HKDF (RFC 5869) with SHA-256 for an output of at most 32 bytes: one expand step. */
const hkdf = (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) =>
  hmac(hmac(salt, ikm), concat(info, Uint8Array.of(1))).subarray(0, length);

/**
 * Encrypts with a given salt and sender key: the deterministic core, which the worked example checks. {@link encryptPush} draws
 * both at random for every message; nothing else may call this with a salt or a key used before.
 */
export function encryptWith(
  plaintext: Uint8Array,
  receiver: Receiver,
  sender: { readonly privateKey: Uint8Array; readonly salt: Uint8Array },
): { readonly body: Uint8Array; readonly intermediates: Intermediates } {
  if (plaintext.length > MAX_PLAINTEXT) throw new EncryptionError('the message is too large');
  if (receiver.authSecret.length !== 16) throw new EncryptionError('auth is not 16 bytes');
  if (receiver.publicKey.length !== 65 || receiver.publicKey[0] !== 0x04)
    throw new EncryptionError('p256dh is not an uncompressed P-256 point');
  if (sender.salt.length !== 16) throw new EncryptionError('the salt is not 16 bytes');
  if (!isPrivateScalar(sender.privateKey))
    throw new EncryptionError('the sender key is not a P-256 key');

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(sender.privateKey));
  const senderPublic = publicPointOf(sender.privateKey);
  let ecdhSecret: Uint8Array;
  try {
    ecdhSecret = new Uint8Array(ecdh.computeSecret(Buffer.from(receiver.publicKey)));
  } catch {
    // A point that is not on the curve: no message can be encrypted to it.
    throw new EncryptionError('p256dh is not a point on P-256');
  }

  // RFC 8291 §3.3 and §3.4: the shared secret and the auth secret combined, then RFC 8188's key and nonce.
  const keyInfo = concat(utf8('WebPush: info'), Uint8Array.of(0), receiver.publicKey, senderPublic);
  const ikm = hkdf(receiver.authSecret, ecdhSecret, keyInfo, 32);
  const prk = hmac(sender.salt, ikm);
  const cek = hkdf(
    sender.salt,
    ikm,
    concat(utf8('Content-Encoding: aes128gcm'), Uint8Array.of(0)),
    16,
  );
  const nonce = hkdf(
    sender.salt,
    ikm,
    concat(utf8('Content-Encoding: nonce'), Uint8Array.of(0)),
    12,
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE);
  const header = concat(sender.salt, recordSize, Uint8Array.of(senderPublic.length), senderPublic);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const sealed = concat(
    new Uint8Array(cipher.update(concat(plaintext, Uint8Array.of(2)))),
    new Uint8Array(cipher.final()),
    new Uint8Array(cipher.getAuthTag()),
  );
  return {
    body: concat(header, sealed),
    intermediates: { ecdhSecret, ikm, prk, cek, nonce, header },
  };
}

/** Encrypts a message to a browser with a new salt and a new one-time sender key. */
export function encryptPush(plaintext: Uint8Array, receiver: Receiver): Uint8Array {
  let privateKey: Uint8Array;
  do privateKey = new Uint8Array(randomBytes(32));
  while (!isPrivateScalar(privateKey));
  return encryptWith(plaintext, receiver, { privateKey, salt: new Uint8Array(randomBytes(16)) })
    .body;
}
