import { Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, encryptToRecipients } from '../backup-encryption';

describe('backup archive encryption (RFC 0084, epic task 8.16; migrated to age, workstream 0023 leg 1)', () => {
  describe('passphrase mode', () => {
    it('round-trips: encrypt then decrypt with the correct passphrase', async () => {
      const plaintext = Buffer.from('a fake tar.gz archive of substantial size'.repeat(100));
      const ciphertext = await encrypt(plaintext, 'correct horse battery staple');
      const decrypted = await decrypt(ciphertext, 'correct horse battery staple');
      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('round-trips an empty archive', async () => {
      const ciphertext = await encrypt(Buffer.alloc(0), 'passphrase');
      const decrypted = await decrypt(ciphertext, 'passphrase');
      expect(decrypted).toHaveLength(0);
    });

    it('fails cleanly, not silently, with the wrong passphrase', async () => {
      const ciphertext = await encrypt(Buffer.from('secret archive bytes'), 'right-passphrase');
      await expect(decrypt(ciphertext, 'wrong-passphrase')).rejects.toThrow(/decryption failed/i);
    });

    it('fails cleanly on tampered ciphertext (auth check)', async () => {
      const ciphertext = await encrypt(Buffer.from('secret archive bytes'), 'passphrase');
      const bytes = Buffer.from(ciphertext, 'base64url');
      const lastIndex = bytes.length - 1;
      bytes.writeUInt8(bytes.readUInt8(lastIndex) ^ 0xff, lastIndex); // flip a bit near the end
      const tampered = bytes.toString('base64url');
      await expect(decrypt(tampered, 'passphrase')).rejects.toThrow(/decryption failed/i);
    });

    it('fails cleanly on truncated/malformed ciphertext', async () => {
      await expect(
        decrypt(Buffer.from('too short').toString('base64url'), 'passphrase'),
      ).rejects.toThrow(/decryption failed/i);
    });

    it('produces different ciphertext for the same plaintext (random salt/nonce)', async () => {
      const a = await encrypt(Buffer.from('same plaintext'), 'passphrase');
      const b = await encrypt(Buffer.from('same plaintext'), 'passphrase');
      expect(a).not.toBe(b);
    });
  });

  describe('recipient mode', () => {
    it('round-trips: encrypt to a recipient, decrypt with the matching identity', async () => {
      const identity = await generateIdentity();
      const recipient = await identityToRecipient(identity);
      const plaintext = Buffer.from('a personal backup archive');

      const ciphertext = await encryptToRecipients(plaintext, [recipient]);

      const decrypter = new Decrypter();
      decrypter.addIdentity(identity);
      const decrypted = await decrypter.decrypt(Buffer.from(ciphertext, 'base64url'));
      expect(Buffer.from(decrypted).equals(plaintext)).toBe(true);
    });

    it('encrypts to multiple recipients — any one matching identity can decrypt', async () => {
      const identityA = await generateIdentity();
      const identityB = await generateIdentity();
      const recipientA = await identityToRecipient(identityA);
      const recipientB = await identityToRecipient(identityB);
      const plaintext = Buffer.from('shared between two recipients');

      const ciphertext = await encryptToRecipients(plaintext, [recipientA, recipientB]);

      for (const identity of [identityA, identityB]) {
        const decrypter = new Decrypter();
        decrypter.addIdentity(identity);
        const decrypted = await decrypter.decrypt(Buffer.from(ciphertext, 'base64url'));
        expect(Buffer.from(decrypted).equals(plaintext)).toBe(true);
      }
    });

    it('fails cleanly with a non-matching identity', async () => {
      const identity = await generateIdentity();
      const recipient = await identityToRecipient(identity);
      const wrongIdentity = await generateIdentity();

      const ciphertext = await encryptToRecipients(Buffer.from('secret'), [recipient]);

      const decrypter = new Decrypter();
      decrypter.addIdentity(wrongIdentity);
      await expect(decrypter.decrypt(Buffer.from(ciphertext, 'base64url'))).rejects.toThrow();
    });

    it('produces different ciphertext for the same plaintext and recipient (random file key)', async () => {
      const identity = await generateIdentity();
      const recipient = await identityToRecipient(identity);
      const a = await encryptToRecipients(Buffer.from('same plaintext'), [recipient]);
      const b = await encryptToRecipients(Buffer.from('same plaintext'), [recipient]);
      expect(a).not.toBe(b);
    });
  });
});
