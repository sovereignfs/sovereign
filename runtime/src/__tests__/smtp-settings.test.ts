import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock @sovereignfs/db before importing the module under test so the real DB
// is never opened during unit tests.
vi.mock('@sovereignfs/db', () => ({
  DEFAULT_TENANT_ID: 'default',
  getPlatformSetting: vi.fn(),
  setPlatformSetting: vi.fn(),
}));

import { getPlatformSetting, setPlatformSetting, type PlatformDb } from '@sovereignfs/db';
import {
  readStoredSmtpSettings,
  resolveEffectiveMailerConfig,
  writeStoredSmtpSettings,
} from '../smtp-settings';

const previousKey = process.env.SOVEREIGN_VAULT_KEY;
const FAKE_DB = {} as PlatformDb;

function store(values: Partial<Record<string, string | null>>) {
  vi.mocked(getPlatformSetting).mockImplementation(async (_db, key: string) => {
    return values[key] ?? null;
  });
}

afterEach(() => {
  vi.mocked(getPlatformSetting).mockReset();
  vi.mocked(setPlatformSetting).mockReset();
  if (previousKey === undefined) {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_VAULT_KEY');
  } else {
    process.env.SOVEREIGN_VAULT_KEY = previousKey;
  }
});

describe('readStoredSmtpSettings', () => {
  it('returns all-null / hasPassword: false when nothing is stored', async () => {
    store({});
    const result = await readStoredSmtpSettings(FAKE_DB);
    expect(result).toEqual({ host: null, port: null, user: null, from: null, hasPassword: false });
  });

  it('reads stored fields, coercing port to a number', async () => {
    store({ smtp_host: 'smtp.example.com', smtp_port: '2525', smtp_pass_encrypted: 'sv1:a:b:c' });
    const result = await readStoredSmtpSettings(FAKE_DB);
    expect(result.host).toBe('smtp.example.com');
    expect(result.port).toBe(2525);
    expect(result.hasPassword).toBe(true);
  });
});

describe('writeStoredSmtpSettings', () => {
  it('writes only the fields provided, leaving the password alone when omitted', async () => {
    await writeStoredSmtpSettings(FAKE_DB, { host: 'smtp.example.com', port: 587 });
    const writtenKeys = vi.mocked(setPlatformSetting).mock.calls.map((call) => call[1]);
    expect(writtenKeys).toContain('smtp_host');
    expect(writtenKeys).toContain('smtp_port');
    expect(writtenKeys).not.toContain('smtp_pass_encrypted');
  });

  it('encrypts and writes the password only when non-empty', async () => {
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
    await writeStoredSmtpSettings(FAKE_DB, { pass: 'hunter2' });
    const passCall = vi
      .mocked(setPlatformSetting)
      .mock.calls.find((call) => call[1] === 'smtp_pass_encrypted');
    expect(passCall).toBeDefined();
    expect(passCall?.[2]).not.toContain('hunter2');

    vi.mocked(setPlatformSetting).mockClear();
    await writeStoredSmtpSettings(FAKE_DB, { pass: '' });
    expect(
      vi.mocked(setPlatformSetting).mock.calls.some((call) => call[1] === 'smtp_pass_encrypted'),
    ).toBe(false);
  });
});

describe('resolveEffectiveMailerConfig', () => {
  it('leaves unset fields undefined so createMailer() falls through to env', async () => {
    store({ smtp_host: 'smtp.example.com' });
    const config = await resolveEffectiveMailerConfig(FAKE_DB);
    expect(config.host).toBe('smtp.example.com');
    expect(config.port).toBeUndefined();
    expect(config.pass).toBeUndefined();
  });

  it('decrypts a stored password', async () => {
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
    const { encryptSecretValue } = await import('../secrets');
    const ciphertext = encryptSecretValue('hunter2', {
      tenantId: 'default',
      pluginId: 'fs.sovereign.platform',
      scope: 'instance',
      userId: null,
    });
    store({ smtp_pass_encrypted: ciphertext });
    const config = await resolveEffectiveMailerConfig(FAKE_DB);
    expect(config.pass).toBe('hunter2');
  });
});
