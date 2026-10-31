import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { afterEach, describe, expect, it } from 'vitest';
import { Refused } from '../errors.js';
import { ensureOperatorKey, keyFile, readOperatorKey } from './keys.js';
import { decryptValue, encryptValue, isCiphertext, SecretsFile } from './store.js';

const folders: string[] = [];
const folder = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-store-'));
  folders.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the operator’s key', () => {
  it('lives under ~/.config/sovereign, or where SV_CONFIG_DIR or XDG_CONFIG_HOME say', () => {
    expect(keyFile({}, '/home/o')).toBe('/home/o/.config/sovereign/age.key');
    expect(keyFile({ XDG_CONFIG_HOME: '/x' }, '/home/o')).toBe('/x/sovereign/age.key');
    expect(keyFile({ SV_CONFIG_DIR: '/y', XDG_CONFIG_HOME: '/x' }, '/home/o')).toBe('/y/age.key');
  });

  it('is made once, readable by its owner alone, and found again', async () => {
    const file = path.join(folder(), 'config', 'age.key');
    const first = await ensureOperatorKey(file);
    expect(first.created).toBe(true);
    expect(first.key.recipient).toMatch(/^age1[0-9a-z]+$/);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    const second = await ensureOperatorKey(file);
    expect(second.created).toBe(false);
    expect(second.key.recipient).toBe(first.key.recipient);
  });

  it('is not made over a file that holds no key', async () => {
    const file = path.join(folder(), 'age.key');
    writeFileSync(file, 'not a key');
    await expect(readOperatorKey(file)).rejects.toBeInstanceOf(Refused);
  });
});

describe('secrets', () => {
  it('are armored age ciphertext that every recipient can read and no one else can', async () => {
    const [a, b, c] = await Promise.all([
      generateX25519Identity(),
      generateX25519Identity(),
      generateX25519Identity(),
    ]);
    const armored = await encryptValue('hunter2', [
      await identityToRecipient(a),
      await identityToRecipient(b),
    ]);
    expect(isCiphertext(armored)).toBe(true);
    expect(armored).not.toContain('hunter2');
    expect(await decryptValue(armored, a)).toBe('hunter2');
    expect(await decryptValue(armored, b)).toBe('hunter2');
    await expect(decryptValue(armored, c)).rejects.toThrow('Your key cannot decrypt this secret');
  });

  it('are told from plain text', () => {
    expect(isCiphertext('hunter2')).toBe(false);
    expect(isCiphertext(5)).toBe(false);
  });

  it('are kept in a file that survives a round trip and keeps each owner apart', async () => {
    const root = folder();
    const identity = await generateX25519Identity();
    const recipient = await identityToRecipient(identity);
    const file = await SecretsFile.load(root);
    file.set('core', 'SV_SMTP_PASSWORD', await encryptValue('a', [recipient]));
    file.set('notes', 'NOTES_API_KEY', await encryptValue('b', [recipient]));
    await file.save();
    const again = (await SecretsFile.load(root)).value;
    expect(Object.keys(again)).toEqual(['core', 'notes']);
    expect(await decryptValue(again.notes?.NOTES_API_KEY ?? '', identity)).toBe('b');
  });

  it('forgets an owner who has nothing left', async () => {
    const root = folder();
    const file = await SecretsFile.load(root);
    file.set(
      'notes',
      'NOTES_API_KEY',
      await encryptValue('b', [await identityToRecipient(await generateX25519Identity())]),
    );
    expect(file.remove('notes', 'NOTES_API_KEY')).toBe(true);
    expect(file.remove('notes', 'NOTES_API_KEY')).toBe(false);
    expect(file.value).toEqual({});
  });
});
