import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Key-service coverage (RFC 0092, epic task 8.31): first-use key creation,
 * caching, closure round-trips, AAD binding at the cipher layer, and the
 * missing-KEK failure. The DB layer is mocked with an in-memory row store;
 * the crypto primitives are the real @sovereignfs/db implementations
 * (vi.importActual) so what's exercised here is the actual wrap/unwrap path.
 */

const store = new Map<string, unknown>();

vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return {
    ...actual,
    getPlatformDb: vi.fn(async () => ({ dialect: 'sqlite' })),
    getFieldKeyRow: vi.fn(async (_pdb: unknown, pluginId: string, cls: string) => {
      return store.get(`${pluginId}:${cls}`);
    }),
    createFieldKeyRow: vi.fn(async (_pdb: unknown, kek: Buffer, pluginId: string, cls: string) => {
      const row = {
        id: randomBytes(8).toString('hex'),
        pluginId,
        class: cls,
        wrappedDek: actual.wrapKeyMaterial(kek, randomBytes(32), {
          pluginId,
          class: cls,
          purpose: 'dek',
        }),
        wrappedHmacKey: actual.wrapKeyMaterial(kek, randomBytes(32), {
          pluginId,
          class: cls,
          purpose: 'hmac',
        }),
        kekFingerprint: actual.kekFingerprint(kek),
        createdAt: 0,
        updatedAt: 0,
      };
      store.set(`${pluginId}:${cls}`, row);
      return row;
    }),
  };
});

import { createFieldKeyRow, getFieldKeyRow } from '@sovereignfs/db';
import { clearFieldKeyCache, getFieldCipher, isClassEnabled } from '../field-encryption-keys';

const KEK = randomBytes(32).toString('base64');

describe('field-encryption key service', () => {
  beforeEach(() => {
    store.clear();
    clearFieldKeyCache();
    vi.clearAllMocks();
    process.env.SOVEREIGN_FIELD_KEK = KEK;
    process.env.SOVEREIGN_ENCRYPT_CLASSES = 'pii,health';
  });

  afterEach(() => {
    delete process.env.SOVEREIGN_FIELD_KEK;
    delete process.env.SOVEREIGN_ENCRYPT_CLASSES;
  });

  it('creates keys on first use, then serves the cache (one DB read total)', async () => {
    const cipher = await getFieldCipher('fs.test.plugin', 'pii');
    expect(createFieldKeyRow).toHaveBeenCalledTimes(1);

    const again = await getFieldCipher('fs.test.plugin', 'pii');
    expect(getFieldKeyRow).toHaveBeenCalledTimes(1); // second call never hit the DB

    // Both handles decrypt each other's output — same underlying DEK.
    const aad = Buffer.from('ctx');
    expect(again.decrypt(cipher.encrypt('secret', aad), aad)).toBe('secret');
  });

  it('round-trips utf8 and rejects a tampered AAD', async () => {
    const cipher = await getFieldCipher('fs.test.plugin', 'pii');
    const payload = cipher.encrypt('médical — note', Buffer.from('a'));
    expect(cipher.decrypt(payload, Buffer.from('a'))).toBe('médical — note');
    expect(() => cipher.decrypt(payload, Buffer.from('b'))).toThrow();
  });

  it('scopes keys per (plugin × class) — cross-decryption fails', async () => {
    const pii = await getFieldCipher('fs.test.plugin', 'pii');
    const health = await getFieldCipher('fs.test.plugin', 'health');
    const aad = Buffer.from('ctx');
    expect(() => health.decrypt(pii.encrypt('x', aad), aad)).toThrow();
  });

  it('hmac is deterministic per key, differing across classes', async () => {
    const pii = await getFieldCipher('fs.test.plugin', 'pii');
    const health = await getFieldCipher('fs.test.plugin', 'health');
    expect(pii.hmac('needle')).toBe(pii.hmac('needle'));
    expect(pii.hmac('needle')).not.toBe(health.hmac('needle'));
  });

  it('fails with a config error when the KEK is unset', async () => {
    delete process.env.SOVEREIGN_FIELD_KEK;
    await expect(getFieldCipher('fs.test.plugin', 'pii')).rejects.toThrow(
      /SOVEREIGN_FIELD_KEK is not set/,
    );
  });

  it('isClassEnabled reflects the operator policy', () => {
    expect(isClassEnabled('pii')).toBe(true);
    expect(isClassEnabled('financial')).toBe(false);
    delete process.env.SOVEREIGN_ENCRYPT_CLASSES;
    expect(isClassEnabled('pii')).toBe(false);
  });
});
