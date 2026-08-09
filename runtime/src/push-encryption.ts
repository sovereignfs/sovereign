import {
  createCipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * End-to-end payload encryption for native mobile push (RFC 0087's
 * "Encryption"). The relay (`apps/relay`) must never be able to decrypt
 * this — it only ever forwards the opaque `encryptedPayload` string this
 * module produces.
 *
 * **Scheme:** ephemeral ECDH (P-256) with the device's stored public key,
 * HKDF-SHA256 to derive an AES-256-GCM key, standard authenticated
 * encryption of the JSON payload. Not Web Push's RFC 8291 wire format — that
 * framing exists to satisfy browser `PushManager` internals, an irrelevant
 * constraint here since Sovereign controls both ends (RFC 0087's own
 * reasoning).
 *
 * **Wire format** (base64 of the concatenation, in order) — verified
 * end-to-end against a real generated P-256 keypair (encrypt with one
 * ephemeral key, decrypt using only the recipient's own private key and the
 * transmitted ephemeral public key) before being trusted, not just
 * typechecked:
 *
 * ```
 * [ 65 bytes: ephemeral public key, SEC1/X9.63 uncompressed point (0x04 || X || Y) ]
 * [ 12 bytes: AES-GCM IV (random per message) ]
 * [ 16 bytes: AES-GCM authentication tag ]
 * [   N bytes: ciphertext ]
 * ```
 *
 * The 65-byte uncompressed-point format is deliberate, not arbitrary: it is
 * exactly what iOS `CryptoKit`'s `P256.KeyAgreement.PublicKey.rawRepresentation`
 * produces/consumes and what Android's `ECPublicKey` X9.63 encoding produces
 * with a leading `0x04` byte — leg 4 (`sovereign-mobile`, a different repo)
 * needs no format conversion on either platform. `push_device_tokens.public_key`
 * (RFC 0087's device-token schema) is expected to be this same 65-byte point,
 * base64-encoded, exactly as the device's own key-generation API returns it.
 *
 * HKDF `info` is a fixed, versioned string (not per-message) so a future
 * incompatible change bumps the version rather than silently producing
 * undecryptable payloads for devices still on the old scheme.
 */

const HKDF_INFO = Buffer.from('sovereign-push-v1');
const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');

function importDevicePublicKey(devicePublicKeyBase64: string) {
  const rawPoint = Buffer.from(devicePublicKeyBase64, 'base64');
  if (rawPoint.length !== 65 || rawPoint[0] !== 0x04) {
    throw new Error(
      'Device public key must be a 65-byte uncompressed P-256 point (0x04 || X || Y)',
    );
  }
  return createPublicKey({
    key: Buffer.concat([P256_SPKI_PREFIX, rawPoint]),
    format: 'der',
    type: 'spki',
  });
}

/**
 * Encrypts `payload` against a device's stored public key. Throws on a
 * malformed stored key (caller should treat that the same as any other
 * send failure — it means the device registered a corrupt key, not a
 * transient error).
 */
export function encryptPushPayload(devicePublicKeyBase64: string, payload: unknown): string {
  const devicePublicKey = importDevicePublicKey(devicePublicKeyBase64);
  const ephemeral = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ephemeralPublicKeyRaw = ephemeral.publicKey
    .export({ type: 'spki', format: 'der' })
    .subarray(-65);

  const sharedSecret = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: devicePublicKey,
  });
  const aesKey = Buffer.from(hkdfSync('sha256', sharedSecret, Buffer.alloc(0), HKDF_INFO, 32));

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([ephemeralPublicKeyRaw, iv, authTag, ciphertext]).toString('base64');
}
