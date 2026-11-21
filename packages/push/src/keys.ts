import { createECDH, createPrivateKey, randomBytes, type KeyObject } from 'node:crypto';
import { fromBase64Url, toBase64Url } from './bytes.js';

/** The order of P-256's group: a private key is a whole number from 1 to one less than this. */
const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/** The app's key pair: the private key as `<PREFIX>_VAPID_PRIVATE_KEY` holds it, and the public key a browser subscribes with. */
export interface PushKeyPair {
  /** 32 bytes, URL-safe base64: the P-256 private scalar. */
  readonly privateKey: string;
  /** 65 bytes, URL-safe base64: the uncompressed P-256 point (`0x04 || x || y`). */
  readonly publicKey: string;
}

/** True when 32 bytes are a P-256 private key: not zero and below the group's order. */
export function isPrivateScalar(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
  return value > 0n && value < ORDER;
}

/** The uncompressed public point of a private scalar. The scalar must be valid ({@link isPrivateScalar}). */
export function publicPointOf(privateScalar: Uint8Array): Uint8Array {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(privateScalar));
  return new Uint8Array(ecdh.getPublicKey(null, 'uncompressed'));
}

/**
 * The key pair of a private key in URL-safe base64, or `undefined` when it is not one: not 32 bytes, zero, or not below the
 * group's order. The public key follows from the private one, so it is never configured.
 */
export function keyPairOf(privateKey: string): PushKeyPair | undefined {
  const scalar = fromBase64Url(privateKey);
  if (!scalar || !isPrivateScalar(scalar)) return undefined;
  return { privateKey, publicKey: toBase64Url(publicPointOf(scalar)) };
}

/** A new key pair, from 32 random bytes (redrawn in the vanishing case that they are not a valid scalar). */
export function generatePushKeys(): PushKeyPair {
  for (;;) {
    const scalar = new Uint8Array(randomBytes(32));
    if (isPrivateScalar(scalar)) {
      return { privateKey: toBase64Url(scalar), publicKey: toBase64Url(publicPointOf(scalar)) };
    }
  }
}

/** A signing key for ES256 made from the scalar and its point, as a JWK, so no ASN.1 is written by hand. */
export function signingKeyOf(privateScalar: Uint8Array): KeyObject {
  const point = publicPointOf(privateScalar);
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: toBase64Url(privateScalar),
      x: toBase64Url(point.subarray(1, 33)),
      y: toBase64Url(point.subarray(33, 65)),
    },
    format: 'jwk',
  });
}
