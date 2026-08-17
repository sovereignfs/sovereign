import { describe, expect, it } from 'vitest';
import { decrypt, deriveKey, encrypt } from '../backup-encryption';

describe('backup archive encryption (RFC 0084, epic task 8.16)', () => {
  it('round-trips: encrypt then decrypt with the correct passphrase', () => {
    const plaintext = Buffer.from('a fake tar.gz archive of substantial size'.repeat(100));
    const ciphertext = encrypt(plaintext, 'correct horse battery staple');
    const decrypted = decrypt(ciphertext, 'correct horse battery staple');
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('round-trips an empty archive', () => {
    const ciphertext = encrypt(Buffer.alloc(0), 'passphrase');
    const decrypted = decrypt(ciphertext, 'passphrase');
    expect(decrypted).toHaveLength(0);
  });

  it('fails cleanly, not silently, with the wrong passphrase', () => {
    const ciphertext = encrypt(Buffer.from('secret archive bytes'), 'right-passphrase');
    expect(() => decrypt(ciphertext, 'wrong-passphrase')).toThrow(/decryption failed/i);
  });

  it('fails cleanly on tampered ciphertext (auth tag check)', () => {
    const ciphertext = encrypt(Buffer.from('secret archive bytes'), 'passphrase');
    const bytes = Buffer.from(ciphertext, 'base64url');
    const lastIndex = bytes.length - 1;
    bytes.writeUInt8(bytes.readUInt8(lastIndex) ^ 0xff, lastIndex); // flip a bit inside the auth tag
    const tampered = bytes.toString('base64url');
    expect(() => decrypt(tampered, 'passphrase')).toThrow(/decryption failed/i);
  });

  it('rejects truncated ciphertext shorter than salt+iv+tag', () => {
    expect(() => decrypt(Buffer.from('too short').toString('base64url'), 'passphrase')).toThrow(
      /too short/i,
    );
  });

  it('produces different ciphertext for the same plaintext (random salt/iv)', () => {
    const a = encrypt(Buffer.from('same plaintext'), 'passphrase');
    const b = encrypt(Buffer.from('same plaintext'), 'passphrase');
    expect(a).not.toBe(b);
  });

  it('deriveKey is deterministic for the same passphrase and salt', () => {
    const salt = Buffer.from('0123456789abcdef');
    expect(deriveKey('passphrase', salt).equals(deriveKey('passphrase', salt))).toBe(true);
  });

  it('deriveKey differs for different salts', () => {
    const salt1 = Buffer.from('0123456789abcdef');
    const salt2 = Buffer.from('fedcba9876543210');
    expect(deriveKey('passphrase', salt1).equals(deriveKey('passphrase', salt2))).toBe(false);
  });
});
