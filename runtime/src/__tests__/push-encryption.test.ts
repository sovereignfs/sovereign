import {
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptPushPayload } from '../push-encryption';

const HKDF_INFO = Buffer.from('sovereign-push-v1');

/** Decrypts using only the recipient's own private key + the wire blob —
 *  exactly what a real device (CryptoKit/javax.crypto) would do, proving
 *  the format is genuinely decodable and not just self-consistent within
 *  this module. */
function decryptForTest(
  devicePrivateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  wireBase64: string,
) {
  const wire = Buffer.from(wireBase64, 'base64');
  const ephemeralPubRaw = wire.subarray(0, 65);
  const iv = wire.subarray(65, 77);
  const authTag = wire.subarray(77, 93);
  const ciphertext = wire.subarray(93);

  const spkiPrefix = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
  const ephemeralPublicKey = createPublicKey({
    key: Buffer.concat([spkiPrefix, ephemeralPubRaw]),
    format: 'der',
    type: 'spki',
  });

  const sharedSecret = diffieHellman({
    privateKey: devicePrivateKey,
    publicKey: ephemeralPublicKey,
  });
  const aesKey = Buffer.from(hkdfSync('sha256', sharedSecret, Buffer.alloc(0), HKDF_INFO, 32));

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function generateDeviceKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyBase64 = publicKey
    .export({ type: 'spki', format: 'der' })
    .subarray(-65)
    .toString('base64');
  return { publicKey, privateKey, publicKeyBase64 };
}

describe('encryptPushPayload', () => {
  it('round-trips through a real device keypair — decryptable with only the device private key', () => {
    const { privateKey, publicKeyBase64 } = generateDeviceKeypair();
    const wire = encryptPushPayload(publicKeyBase64, { title: 'Hello', body: 'World' });
    const decrypted = decryptForTest(privateKey, wire);
    expect(JSON.parse(decrypted)).toEqual({ title: 'Hello', body: 'World' });
  });

  it('produces a different ciphertext every call (random ephemeral key + IV)', () => {
    const { publicKeyBase64 } = generateDeviceKeypair();
    const first = encryptPushPayload(publicKeyBase64, { title: 'T' });
    const second = encryptPushPayload(publicKeyBase64, { title: 'T' });
    expect(first).not.toBe(second);
  });

  it('is not decryptable by a different device (wrong private key)', () => {
    const { publicKeyBase64 } = generateDeviceKeypair();
    const wrongDevice = generateDeviceKeypair();
    const wire = encryptPushPayload(publicKeyBase64, { title: 'Secret' });
    expect(() => decryptForTest(wrongDevice.privateKey, wire)).toThrow();
  });

  it('throws on a malformed stored public key (wrong length)', () => {
    expect(() =>
      encryptPushPayload(Buffer.from('too-short').toString('base64'), { title: 'T' }),
    ).toThrow(/65-byte/);
  });

  it('throws when the key is the right length but not an uncompressed point (bad prefix)', () => {
    const bogus = Buffer.alloc(65, 0x02); // wrong leading byte (compressed-point marker, not 0x04)
    expect(() => encryptPushPayload(bogus.toString('base64'), { title: 'T' })).toThrow(/65-byte/);
  });
});
