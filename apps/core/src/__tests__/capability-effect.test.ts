import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER } from '../auth/roles';

/**
 * core-app §3.2.3: a change to the matrix reaches an account that is already signed in. The check
 * (`requireCapability`) reads the matrix in force from the database; nothing is carried in the session.
 */
const APP_ROOT = path.join(import.meta.dirname, '../..');
let folder: string;

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let authorize: typeof import('../auth/authorize');
let configure: typeof import('../roles/configure');
let matrix: typeof import('../roles/matrix');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-capability-effect-'));
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  authorize = await import('../auth/authorize');
  configure = await import('../roles/configure');
  matrix = await import('../roles/matrix');
});

afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.run('delete from capability_overrides');
  matrix.invalidateCapabilityMatrix();
  // The same session throughout: an admin who signed in before anything changed.
  getSession.mockReset().mockResolvedValue({
    user: { id: 'admin-1', role: ROLE_ADMIN },
    session: { id: 's1' },
  });
});
afterEach(() => vi.useRealTimers());

const allowed = async (capability: Parameters<typeof authorize.requireCapability>[0]) => {
  try {
    await authorize.requireCapability(capability);
    return true;
  } catch (error) {
    if (error instanceof authorize.AuthorizationError && error.code === 'forbidden') return false;
    throw error;
  }
};

describe('a change to the matrix, for an admin who is already signed in', () => {
  it('takes a capability away on the very next check, on the instance that changed it', async () => {
    expect(await allowed('client:manage')).toBe(true);
    await configure.changeCapabilities(db, { id: 'owner-1', role: ROLE_OWNER }, [
      { role: ROLE_ADMIN, capability: 'client:manage', granted: false },
    ]);
    expect(await allowed('client:manage')).toBe(false);
    expect(await allowed('user:view')).toBe(true);
  });

  it('gives one on the very next check', async () => {
    expect(await allowed('instance:configure-secrets')).toBe(false);
    expect(await allowed('console:access')).toBe(true);
    await configure.changeCapabilities(db, { id: 'owner-1', role: ROLE_OWNER }, [
      { role: ROLE_ADMIN, capability: 'console:access', granted: false },
    ]);
    expect(await allowed('console:access')).toBe(false);
    await configure.resetCapabilities(db, { id: 'owner-1', role: ROLE_OWNER });
    expect(await allowed('console:access')).toBe(true);
  });

  it('shows a change another instance made within seconds, far inside the 300 the spec allows', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
    expect(await allowed('client:manage')).toBe(true);
    // Another instance wrote it: this one is not told.
    await db.run(
      'insert into capability_overrides (role, capability, granted, updated_at) values (?, ?, 0, ?)',
      [ROLE_ADMIN, 'client:manage', Date.now()],
    );
    vi.setSystemTime(new Date('2026-10-29T12:00:06Z'));
    expect(await allowed('client:manage')).toBe(false);
  });

  it('never lets an admin hold an owner-only capability, even from a stored row', async () => {
    await db.run(
      'insert into capability_overrides (role, capability, granted, updated_at) values (?, ?, 1, ?)',
      [ROLE_ADMIN, 'capability:configure', Date.now()],
    );
    matrix.invalidateCapabilityMatrix();
    expect(await allowed('capability:configure')).toBe(false);
  });

  it('leaves the owner with everything, whatever the matrix says', async () => {
    getSession.mockResolvedValue({
      user: { id: 'owner-1', role: ROLE_OWNER },
      session: { id: 's2' },
    });
    await db.run(
      'insert into capability_overrides (role, capability, granted, updated_at) values (?, ?, 0, ?)',
      [ROLE_OWNER, 'user:manage', Date.now()],
    );
    matrix.invalidateCapabilityMatrix();
    expect(await allowed('user:manage')).toBe(true);
  });
});
