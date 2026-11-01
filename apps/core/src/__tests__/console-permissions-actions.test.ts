import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';

const APP_ROOT = path.join(import.meta.dirname, '../..');
let folder: string;

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args) as unknown,
}));
const redirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    redirect(to);
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
// The password check is tested with the real hash in ownership.suite; here it only says yes to one password.
vi.mock('../auth', () => ({ getAuth: () => Promise.resolve({}) }));
vi.mock('../auth/confirm-password', () => ({
  confirmPassword: (_database: unknown, _auth: unknown, _id: string, password: string) =>
    Promise.resolve(password === 'right-password' ? 'ok' : 'wrong'),
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let matrix: typeof import('../../app/console/permissions/actions');
let ownership: typeof import('../../app/console/ownership/actions');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-console-permissions-'));
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  matrix = await import('../../app/console/permissions/actions');
  ownership = await import('../../app/console/ownership/actions');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const add = (id: string, role: string, deactivated = false) =>
  db.run(
    'insert into users (id, name, email, email_verified, role, created_at, updated_at, deactivated_at) values (?, ?, ?, 1, ?, 1, 1, ?)',
    [id, id, `${id}@sovereign.local`, role, deactivated ? 1 : null],
  );
const signedInAs = (id: string, role: unknown) =>
  getSession.mockResolvedValue({ user: { id, role }, session: { id: `s-${id}` } });
const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
};
const roleOf = async (id: string) =>
  String((await db.run('select role from users where id = ?', [id])).rows[0]?.role);
const overrides = async () =>
  (
    await db.run(
      'select role, capability, granted from capability_overrides order by role, capability',
    )
  ).rows.map((row) => `${String(row.role)}|${String(row.capability)}|${Number(row.granted)}`);
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  return undefined;
};

/** The ticks of a table where every default is kept: what the page sends if the owner changes nothing. */
const defaults = async () => {
  const { DEFAULT_MATRIX, ALL_CAPABILITIES, CAPABILITIES } = await import('../roles/capabilities');
  const ticks: [string, string][] = [];
  for (const capability of ALL_CAPABILITIES) {
    if (CAPABILITIES[capability].ownerOnly) continue;
    for (const role of [ROLE_ADMIN, ROLE_USER] as const) {
      if (DEFAULT_MATRIX[role].has(capability)) ticks.push(['grant', `${role}|${capability}`]);
    }
  }
  return ticks;
};

beforeEach(async () => {
  for (const table of ['capability_overrides', 'rate_limits', 'sessions', 'users']) {
    await db.run(`delete from ${table}`);
  }
  await add('owner', ROLE_OWNER);
  await add('admin', ROLE_ADMIN);
  await add('other', ROLE_ADMIN);
  await add('pat', ROLE_USER);
  (await import('../roles/matrix')).invalidateCapabilityMatrix();
  getSession.mockReset().mockResolvedValue(null);
  revalidatePath.mockReset();
  redirect.mockReset();
});

describe('what the owner asks of the matrix, as a public endpoint', () => {
  it('refuses nobody, an ordinary person and an admin alike, and changes nothing', async () => {
    for (const who of [null, ['pat', ROLE_USER], ['admin', ROLE_ADMIN]] as const) {
      if (who) signedInAs(who[0], who[1]);
      else getSession.mockResolvedValue(null);
      expect(await failure(() => matrix.saveMatrixAction(null, form([])))).toMatchObject({
        code: who ? 'forbidden' : 'unauthenticated',
      });
      expect(await failure(() => matrix.resetMatrixAction(null))).toMatchObject({
        code: who ? 'forbidden' : 'unauthenticated',
      });
    }
    expect(await overrides()).toEqual([]);
  });
});

describe('saving the matrix', () => {
  it('saves nothing when the table is as the defaults say, and says so', async () => {
    signedInAs('owner', ROLE_OWNER);
    expect(await matrix.saveMatrixAction(null, form(await defaults()))).toEqual({
      ok: true,
      message: 'Nothing was different.',
    });
    expect(await overrides()).toEqual([]);
  });

  it('gives what was ticked and takes what was not, as differences from the defaults', async () => {
    signedInAs('owner', ROLE_OWNER);
    const ticks = (await defaults()).filter(([, v]) => v !== 'platform:admin|client:manage');
    ticks.push(['grant', 'platform:user|user:view']);
    expect(await matrix.saveMatrixAction(null, form(ticks))).toEqual({
      ok: true,
      message: '2 changes are saved. They apply at once.',
    });
    expect(await overrides()).toEqual([
      'platform:admin|client:manage|0',
      'platform:user|user:view|1',
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/console', 'layout');
  });

  it('takes effect at once for the checks that follow', async () => {
    signedInAs('owner', ROLE_OWNER);
    const { getCapabilityMatrix } = await import('../roles/matrix');
    expect((await getCapabilityMatrix())[ROLE_ADMIN].has('client:manage')).toBe(true);
    await matrix.saveMatrixAction(
      null,
      form((await defaults()).filter(([, v]) => v !== 'platform:admin|client:manage')),
    );
    expect((await getCapabilityMatrix())[ROLE_ADMIN].has('client:manage')).toBe(false);
  });

  it('says one change in the singular', async () => {
    signedInAs('owner', ROLE_OWNER);
    const ticks = (await defaults()).filter(([, v]) => v !== 'platform:admin|client:manage');
    expect((await matrix.saveMatrixAction(null, form(ticks))).ok).toBe(true);
    const result = await matrix.saveMatrixAction(
      null,
      form([...ticks, ['grant', 'platform:admin|client:manage']]),
    );
    expect(result).toEqual({ ok: true, message: 'One change is saved. It applies at once.' });
  });

  it('can never give another role what only the owner may hold, whatever the request says', async () => {
    signedInAs('owner', ROLE_OWNER);
    const forged: [string, string][] = [
      ...(await defaults()),
      ['grant', 'platform:admin|instance:configure-secrets'],
      ['grant', 'platform:user|role:assign'],
      ['grant', 'platform:admin|capability:configure'],
      ['grant', 'platform:owner|user:manage'],
      ['grant', 'platform:admin|nonsense'],
    ];
    expect(await matrix.saveMatrixAction(null, form(forged))).toEqual({
      ok: true,
      message: 'Nothing was different.',
    });
    expect(await overrides()).toEqual([]);
  });
});

describe('going back to the defaults', () => {
  it('removes every difference, and says when there was none', async () => {
    signedInAs('owner', ROLE_OWNER);
    await matrix.saveMatrixAction(
      null,
      form((await defaults()).filter(([, v]) => v !== 'platform:admin|client:manage')),
    );
    expect(await matrix.resetMatrixAction(null)).toEqual({
      ok: true,
      message: 'Every role is back to the defaults.',
    });
    expect(await overrides()).toEqual([]);
    expect(await matrix.resetMatrixAction(null)).toEqual({
      ok: true,
      message: 'It was already as the defaults say.',
    });
  });
});

describe('what the owner asks of ownership, as a public endpoint', () => {
  const transfer = (extra: Record<string, string> = {}) =>
    ownership.transferOwnershipAction(
      null,
      form(
        Object.entries({
          target: 'admin',
          newRole: ROLE_ADMIN,
          password: 'right-password',
          ...extra,
        }),
      ),
    );

  it('refuses nobody, an ordinary person and an admin, and changes nothing', async () => {
    getSession.mockResolvedValue(null);
    expect(await failure(() => transfer())).toMatchObject({ code: 'unauthenticated' });
    signedInAs('pat', ROLE_USER);
    expect(await failure(() => transfer())).toMatchObject({ code: 'forbidden' });
    signedInAs('admin', ROLE_ADMIN);
    expect(await failure(() => transfer({ target: 'admin' }))).toMatchObject({ code: 'forbidden' });
    expect(await roleOf('owner')).toBe(ROLE_OWNER);
    expect(await roleOf('admin')).toBe(ROLE_ADMIN);
  });

  it('hands the instance over, then leaves for the Console, which the previous owner still opens as an admin', async () => {
    signedInAs('owner', ROLE_OWNER);
    const thrown = await failure(() => transfer());
    expect(thrown?.message).toBe('NEXT_REDIRECT /console');
    expect(redirect).toHaveBeenCalledWith('/console');
    expect(await roleOf('admin')).toBe(ROLE_OWNER);
    expect(await roleOf('owner')).toBe(ROLE_ADMIN);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('lets the previous owner step back to an ordinary account', async () => {
    signedInAs('owner', ROLE_OWNER);
    await failure(() => transfer({ newRole: ROLE_USER }));
    expect(await roleOf('owner')).toBe(ROLE_USER);
  });

  it('says in words, inline, that the password is wrong, and changes nothing', async () => {
    signedInAs('owner', ROLE_OWNER);
    expect(await transfer({ password: 'guess' })).toEqual({
      ok: false,
      error: 'That password is not right.',
    });
    expect(await roleOf('owner')).toBe(ROLE_OWNER);
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['an ordinary account', { target: 'pat' }],
    ['no one', { target: '' }],
    ['someone who is not there', { target: 'nobody' }],
    ['themselves', { target: 'owner' }],
  ])('refuses to hand it to %s', async (_who, values) => {
    signedInAs('owner', ROLE_OWNER);
    const result = await transfer(values);
    expect(result.ok).toBe(false);
    expect(await roleOf('owner')).toBe(ROLE_OWNER);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('refuses to hand it to an admin who is deactivated', async () => {
    await add('gone', ROLE_ADMIN, true);
    signedInAs('owner', ROLE_OWNER);
    expect((await transfer({ target: 'gone' })).ok).toBe(false);
    expect(await roleOf('gone')).toBe(ROLE_ADMIN);
  });

  it('refuses a role for the previous owner that is not admin or user', async () => {
    signedInAs('owner', ROLE_OWNER);
    expect((await transfer({ newRole: ROLE_OWNER })).ok).toBe(false);
    expect(await roleOf('owner')).toBe(ROLE_OWNER);
  });
});
