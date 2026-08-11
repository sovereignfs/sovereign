import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * svf1/svf0 envelope coverage for the sdk.crypto host implementation (RFC
 * 0092, epic task 8.32): permission gating, policy-driven passthrough vs
 * ciphertext, round-trips, context/AAD binding, the cross-plugin dekId
 * guard (indistinguishable from a missing row), and the decrypt-ignores-
 * policy semantic. Key service + DB are mocked with an in-memory store; the
 * AES-GCM in the fake cipher is real node:crypto, so tamper tests exercise
 * actual authentication.
 */

interface FakeRow {
  id: string;
  pluginId: string;
  class: string;
}

const rows = new Map<string, FakeRow>(); // dekId -> row
const keys = new Map<string, Buffer>(); // `${pluginId}:${cls}` -> DEK

function fakeCipher(pluginId: string, cls: string) {
  const mapKey = `${pluginId}:${cls}`;
  let dek = keys.get(mapKey);
  let dekId = [...rows.values()].find((r) => r.pluginId === pluginId && r.class === cls)?.id;
  if (!dek || !dekId) {
    dek = randomBytes(32);
    dekId = randomBytes(8).toString('hex');
    keys.set(mapKey, dek);
    rows.set(dekId, { id: dekId, pluginId, class: cls });
  }
  const dekFinal = dek;
  return {
    dekId,
    encrypt(plaintext: string, aad: Buffer): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', dekFinal, iv);
      cipher.setAAD(aad);
      const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ct.toString('base64url'),
      ].join(':');
    },
    decrypt(payload: string, aad: Buffer): string {
      const [iv, tag, ct] = payload.split(':');
      if (!iv || !tag || !ct) throw new Error('malformed');
      const decipher = createDecipheriv('aes-256-gcm', dekFinal, Buffer.from(iv, 'base64url'));
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ct, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
    hmac(input: string): string {
      return createHmac('sha256', dekFinal).update(input, 'utf8').digest('base64url');
    },
  };
}

vi.mock('../field-encryption-keys', () => ({
  getFieldCipher: vi.fn(async (pluginId: string, cls: string) => fakeCipher(pluginId, cls)),
  isClassEnabled: vi.fn((cls: string) => enabledClasses.has(cls)),
}));

vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return {
    ...actual,
    getPlatformDb: vi.fn(async () => ({ dialect: 'sqlite' })),
    getFieldKeyRowById: vi.fn(async (_pdb: unknown, id: string) => rows.get(id)),
  };
});

let enabledClasses = new Set<string>(['pii', 'health']);

import { decryptFieldValue, encryptFieldValue, requireCryptoPluginContext } from '../field-crypto';

const CTX = { tenantId: 'default', pluginId: 'fs.test.plugin' };

describe('requireCryptoPluginContext', () => {
  it('rejects a plugin without crypto:use, accepts one with it', () => {
    expect(() =>
      requireCryptoPluginContext('fs.a', { id: 'fs.a', permissions: ['auth:session'] }),
    ).toThrow(/crypto:use/);
    expect(() => requireCryptoPluginContext('fs.a', undefined)).toThrow(/not installed/);
    expect(() =>
      requireCryptoPluginContext('fs.a', { id: 'fs.a', permissions: ['crypto:use'] }),
    ).not.toThrow();
  });
});

describe('encryptFieldValue / decryptFieldValue', () => {
  beforeEach(() => {
    rows.clear();
    keys.clear();
    enabledClasses = new Set(['pii', 'health']);
  });

  it('enabled class → svf1 ciphertext that round-trips', async () => {
    const env = await encryptFieldValue('secret note', { sensitivity: 'pii' }, CTX);
    expect(env.startsWith('svf1:')).toBe(true);
    expect(env).not.toContain('secret note');
    expect(await decryptFieldValue(env, {}, CTX)).toBe('secret note');
  });

  it('disabled class → svf0 passthrough that round-trips and is visibly not ciphertext', async () => {
    const env = await encryptFieldValue('plain value', { sensitivity: 'financial' }, CTX);
    expect(env.startsWith('svf0:')).toBe(true);
    expect(await decryptFieldValue(env, {}, CTX)).toBe('plain value');
  });

  it('decrypt of svf1 ignores the policy — data outlives a class being disabled', async () => {
    const env = await encryptFieldValue('written while enabled', { sensitivity: 'pii' }, CTX);
    enabledClasses = new Set(); // operator later disables everything
    expect(await decryptFieldValue(env, {}, CTX)).toBe('written while enabled');
  });

  it('context binds the ciphertext — mismatch fails', async () => {
    const env = await encryptFieldValue('v', { sensitivity: 'pii', context: 'notes' }, CTX);
    expect(await decryptFieldValue(env, { context: 'notes' }, CTX)).toBe('v');
    await expect(decryptFieldValue(env, { context: 'title' }, CTX)).rejects.toThrow();
    await expect(decryptFieldValue(env, {}, CTX)).rejects.toThrow();
  });

  it("cross-plugin: another plugin's envelope fails exactly like a missing key row", async () => {
    const env = await encryptFieldValue('mine', { sensitivity: 'pii' }, CTX);
    const other = { tenantId: 'default', pluginId: 'fs.other.plugin' };
    await expect(decryptFieldValue(env, {}, other)).rejects.toThrow(/no longer exists/);
    // Same message as a genuinely unknown dekId — no oracle for probing.
    await expect(decryptFieldValue('svf1:ffffffffffffffff:a:b:c', {}, CTX)).rejects.toThrow(
      /no longer exists/,
    );
  });

  it('rejects unknown sensitivity classes and malformed envelopes', async () => {
    await expect(
      encryptFieldValue('v', { sensitivity: 'topsecret' as never }, CTX),
    ).rejects.toThrow(/Unknown sensitivity class/);
    await expect(decryptFieldValue('sv1:a:b:c', {}, CTX)).rejects.toThrow(
      /Unsupported field envelope/,
    );
    await expect(decryptFieldValue('svf1:onlyone', {}, CTX)).rejects.toThrow(/Malformed svf1/);
  });

  it('tampered ciphertext fails authentication', async () => {
    const env = await encryptFieldValue('integrity', { sensitivity: 'pii' }, CTX);
    const parts = env.split(':');
    const ct = Buffer.from(parts[4] as string, 'base64url');
    ct[0] = (ct[0] as number) ^ 0xff;
    parts[4] = ct.toString('base64url');
    await expect(decryptFieldValue(parts.join(':'), {}, CTX)).rejects.toThrow();
  });
});
