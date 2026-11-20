import { createDecipheriv, createECDH, hkdfSync } from 'node:crypto';

/**
 * The browser's side, written here apart from the package's code (and with Node's own HKDF rather than the package's): what a
 * browser does with a push it receives (RFC 8291 §3.4 "for a user agent").
 */
export function decryptAsBrowser(
  body: Uint8Array,
  browser: { privateKey: Uint8Array; publicKey: Uint8Array; auth: Uint8Array },
): string {
  const salt = body.subarray(0, 16);
  const idLength = body[20] ?? 0;
  const senderPublic = body.subarray(21, 21 + idLength);
  const sealed = body.subarray(21 + idLength);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(browser.privateKey));
  const secret = ecdh.computeSecret(Buffer.from(senderPublic));
  const info = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    Buffer.from(browser.publicKey),
    Buffer.from(senderPublic),
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', secret, browser.auth, info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: aes128gcm\0', 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: nonce\0', 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([
    decipher.update(sealed.subarray(0, sealed.length - 16)),
    decipher.final(),
  ]);
  // The last record ends with 0x02, after any zero padding.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (padded[end] !== 2) throw new Error('no final-record delimiter');
  return padded.subarray(0, end).toString('utf8');
}
