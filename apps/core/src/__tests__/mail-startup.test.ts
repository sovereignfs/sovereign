import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const APP_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '../..');
const SECRET = 'a-secret-that-is-long-enough-to-pass-validation';
let folder: string;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-mailstart-'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

async function startUp(env: Record<string, string>) {
  vi.resetModules();
  for (const name of Object.keys(process.env).filter((n) => n.startsWith('SV_')))
    vi.stubEnv(name, '');
  const database = {
    SV_DB_DIALECT: 'sqlite',
    SV_SQLITE_URL: `file:${path.join(folder, 'core.db')}`,
  };
  for (const [name, value] of Object.entries({
    SV_URL: 'http://localhost:3000',
    SV_AUTH_SECRET: SECRET,
    ...database,
    ...env,
  })) {
    vi.stubEnv(name, value);
  }
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit, warnIfMailNotConfigured } = await import('../startup');
  const { getDatabase } = await import('../database');
  await migrateDatabaseOrExit();
  await warnIfMailNotConfigured();
  const database_ = await getDatabase();
  await database_?.close();
  return warn.mock.calls.map((c) => String(c[0])).join('\n');
}

describe('the mail warning at start-up', () => {
  it('is logged when no SMTP server is set, and says what to do and what it costs', async () => {
    const warning = await startUp({});
    expect(warning).toContain('Email is not set up: no SMTP server is set.');
    expect(warning).toContain('SV_SMTP_HOST');
    expect(warning).toContain('sign-up that requires email verification');
  });

  it('says what is missing when SMTP is half set up', async () => {
    expect(await startUp({ SV_SMTP_HOST: 'smtp.example.com' })).toContain(
      'the "from" address is missing',
    );
  });

  it('is not logged when SMTP is set up', async () => {
    expect(
      await startUp({ SV_SMTP_HOST: 'smtp.example.com', SV_SMTP_FROM: 'no-reply@example.com' }),
    ).toBe('');
  });

  it('does not stop core from starting', async () => {
    await expect(startUp({})).resolves.toBeTypeOf('string');
  });
});

describe('with no database at all', () => {
  it('stays quiet and does not throw: the missing database is reported by the configuration check', async () => {
    vi.resetModules();
    for (const name of Object.keys(process.env).filter((n) => n.startsWith('SV_')))
      vi.stubEnv(name, '');
    vi.stubEnv('SV_URL', 'http://localhost:3000');
    vi.stubEnv('SV_AUTH_SECRET', SECRET);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { warnIfMailNotConfigured } = await import('../startup');
    await expect(warnIfMailNotConfigured()).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
