import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SECRET = 'a-secret-that-is-long-enough-to-pass-validation';
let folder: string;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-start-'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

async function startUp(env: Record<string, string>, cwd: string) {
  vi.resetModules();
  for (const name of Object.keys(process.env).filter((n) => n.startsWith('SV_')))
    vi.stubEnv(name, '');
  for (const [name, value] of Object.entries({
    SV_URL: 'http://localhost:3000',
    SV_AUTH_SECRET: SECRET,
    ...env,
  })) {
    vi.stubEnv(name, value);
  }
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // A spy made again in the same test keeps the earlier calls.
  log.mockClear();
  error.mockClear();
  const { migrateDatabaseOrExit } = await import('../startup');
  const { getDatabase } = await import('../database');
  let exited = false;
  try {
    await migrateDatabaseOrExit();
  } catch (thrown) {
    if (!(thrown instanceof Error) || thrown.message !== 'process.exit') throw thrown;
    exited = true;
  }
  const database = await getDatabase().catch(() => undefined);
  return {
    exited,
    database,
    logged: log.mock.calls.map((c) => String(c[0])).join('\n'),
    printed: error.mock.calls.map((c) => String(c[0])).join('\n'),
  };
}

const sqlite = () => ({
  SV_DB_DIALECT: 'sqlite',
  SV_SQLITE_URL: `file:${path.join(folder, 'core.db')}`,
});

describe('migrating at start-up', () => {
  it('stops, naming the variable, when no database is configured: core cannot run without one', async () => {
    const result = await startUp({}, APP_ROOT);
    expect(result.exited).toBe(true);
    expect(result.database).toBeUndefined();
    expect(result.printed).toContain('SV_DB_DIALECT');
  });

  it('brings a new database up to date, and says what it applied', async () => {
    const result = await startUp(sqlite(), APP_ROOT);
    expect(result.exited).toBe(false);
    expect(result.logged).toContain(
      'Database migrated: 0000_instance_settings, 0001_auth_tables, 0002_roles_and_invites, 0003_terms_and_timezone, 0004_two_factor, 0005_passkeys',
    );
    const tables = await result.database?.run(
      "select name from sqlite_master where name in ('instance_settings', 'sv_migrations') order by name",
    );
    expect(tables?.rows.map((r) => r.name)).toEqual(['instance_settings', 'sv_migrations']);
    await result.database?.close();
  });

  it('has nothing to say the second time', async () => {
    const first = await startUp(sqlite(), APP_ROOT);
    await first.database?.close();
    const second = await startUp(sqlite(), APP_ROOT);
    expect(second.exited).toBe(false);
    expect(second.logged).toBe('');
    await second.database?.close();
  });

  it('stops, saying so, when the migrations cannot be found', async () => {
    const result = await startUp(sqlite(), folder);
    expect(result.exited).toBe(true);
    expect(result.printed).toContain('Core could not bring its database up to date');
  });
});
