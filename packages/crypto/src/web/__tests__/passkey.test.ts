import { createHash, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { passkeyKey, passkeyPrfInput } from '../passkey.js';
import { accountWrapData, newKey, unwrapSecret, wrapSecret } from '../records.js';

const bytes = (fill: number) => new Uint8Array(32).fill(fill);
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

describe("a passkey's way in", () => {
  it('asks every passkey of an instance for SHA-256 of the label and the instance id', async () => {
    const id = bytes(7);
    const expected = createHash('sha256')
      .update(Buffer.concat([Buffer.from('sovereign/1/passkey-prf'), Buffer.from(id)]))
      .digest();
    expect(hex(await passkeyPrfInput(id))).toBe(expected.toString('hex'));
    expect(hex(await passkeyPrfInput(bytes(8)))).not.toBe(expected.toString('hex'));
  });

  // The key is not exportable, so it is checked by what it opens: a wrap made with Node's own HKDF of the same output and salt.
  it("makes its key by HKDF of the PRF output, the passkey's salt and the label", async () => {
    const output = bytes(1);
    const salt = bytes(2);
    const raw = new Uint8Array(
      hkdfSync('sha256', output, salt, 'sovereign/1/passkey-unlock', 32) as ArrayBuffer,
    );
    const reference = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
    const secret = newKey();
    const data = accountWrapData('person', 'passkey', 'credential');
    const record = await wrapSecret(reference, secret, data);
    expect(hex(await unwrapSecret(await passkeyKey(output, salt), record, data))).toBe(hex(secret));
  });

  it('gives two passkeys with the same output but different salts keys that do not open each other', async () => {
    const data = accountWrapData('person', 'passkey', 'credential');
    const record = await wrapSecret(await passkeyKey(bytes(1), bytes(2)), newKey(), data);
    await expect(
      unwrapSecret(await passkeyKey(bytes(1), bytes(3)), record, data),
    ).rejects.toThrow();
  });

  it('refuses an output or a salt that is not 32 bytes', async () => {
    await expect(passkeyKey(new Uint8Array(16), bytes(2))).rejects.toThrow(TypeError);
    await expect(passkeyKey(bytes(1), new Uint8Array(31))).rejects.toThrow(TypeError);
  });
});
