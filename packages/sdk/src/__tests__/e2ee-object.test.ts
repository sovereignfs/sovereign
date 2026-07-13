import { describe, expect, it } from 'vitest';
import { generateDek } from '../e2ee-crypto';
import { decryptBlob, decryptJson, encryptBlob, encryptJson } from '../e2ee-object';

describe('encryptBlob/decryptBlob', () => {
  it('round-trips: decrypting with the same DEK recovers the original bytes and content type', async () => {
    const dek = await generateDek();
    const original = new Blob(['hello encrypted world'], { type: 'text/plain' });

    const encrypted = await encryptBlob(dek, original);
    const decrypted = await decryptBlob(dek, encrypted);

    expect(decrypted.type).toBe('text/plain');
    expect(await decrypted.text()).toBe('hello encrypted world');
  });

  it('rejects decrypting with a different DEK', async () => {
    const dek = await generateDek();
    const otherDek = await generateDek();
    const encrypted = await encryptBlob(dek, new Blob(['secret']));

    await expect(decryptBlob(otherDek, encrypted)).rejects.toThrow();
  });

  it('never puts the plaintext in the ciphertext Blob', async () => {
    const dek = await generateDek();
    const encrypted = await encryptBlob(dek, new Blob(['a very secret document']));

    const ciphertextText = await encrypted.ciphertext.text();
    expect(ciphertextText).not.toContain('a very secret document');
  });

  it('produces a different ciphertext on every call (fresh IV)', async () => {
    const dek = await generateDek();
    const blob = new Blob(['same content']);

    const first = await encryptBlob(dek, blob);
    const second = await encryptBlob(dek, blob);

    expect(first.iv).not.toBe(second.iv);
  });
});

describe('encryptJson/decryptJson', () => {
  interface CardMetadata {
    title: string;
    issuer: string;
    notes?: string;
  }

  it('round-trips: decrypting with the same DEK recovers the original value', async () => {
    const dek = await generateDek();
    const value: CardMetadata = {
      title: 'Costco',
      issuer: 'Costco Wholesale',
      notes: 'expires 2027',
    };

    const encrypted = await encryptJson(dek, value);
    const decrypted = await decryptJson<CardMetadata>(dek, encrypted);

    expect(decrypted).toEqual(value);
  });

  it('rejects decrypting with a different DEK', async () => {
    const dek = await generateDek();
    const otherDek = await generateDek();
    const encrypted = await encryptJson(dek, { title: 'secret' });

    await expect(decryptJson(otherDek, encrypted)).rejects.toThrow();
  });

  it('never puts the plaintext value in the ciphertext', async () => {
    const dek = await generateDek();
    const encrypted = await encryptJson(dek, { documentNumber: 'A1234567' });

    expect(encrypted.ciphertext).not.toContain('A1234567');
  });

  it('produces a different ciphertext on every call (fresh IV)', async () => {
    const dek = await generateDek();
    const value = { title: 'same value' };

    const first = await encryptJson(dek, value);
    const second = await encryptJson(dek, value);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
});
