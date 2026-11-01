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
  revalidatePath: (path: string) => revalidatePath(path) as unknown,
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let actions: typeof import('../../app/console/accounts/actions');

// The real manager and states on a real database; only the wiring to apps and mail is left out.
vi.mock('../accounts', async (original) => {
  const real = await original<typeof import('../accounts')>();
  return {
    ...real,
    getAccountManager: async () => {
      const { getDatabase } = await import('../database');
      const database = await getDatabase();
      return new real.AccountManager(
        database,
        new real.AccountStates(database, { log: () => undefined }),
        {
          log: () => undefined,
          mfaReset: () => Promise.resolve(true),
        },
      );
    },
  };
});

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-console-accounts-'));
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  actions = await import('../../app/console/accounts/actions');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const add = (id: string, role: string) =>
  db.run(
    'insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, 1, ?, 1, 1)',
    [id, id, `${id}@sovereign.local`, role],
  );
const signedInAs = (id: string, role: unknown) =>
  getSession.mockResolvedValue({ user: { id, role }, session: { id: `s-${id}` } });
const exists = async (id: string) =>
  (await db.run('select 1 from users where id = ?', [id])).rows.length > 0;
const deactivated = async (id: string) =>
  (await db.run('select deactivated_at from users where id = ?', [id])).rows[0]?.deactivated_at !=
  null;
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { code?: string; digest?: string; message: string };
  }
  return undefined;
};

beforeEach(async () => {
  for (const table of ['sessions', 'two_factors', 'passkeys', 'users'])
    await db.run(`delete from ${table}`);
  await add('owner', ROLE_OWNER);
  await add('admin', ROLE_ADMIN);
  await add('other', ROLE_ADMIN);
  await add('pat', ROLE_USER);
  await add('quinn', ROLE_USER);
  getSession.mockReset().mockResolvedValue(null);
  revalidatePath.mockReset();
});

describe('what an operator asks of an account, as a public endpoint', () => {
  const asks = [
    ['deactivateAction', (id: string) => actions.deactivateAction(id, null)],
    ['reactivateAction', (id: string) => actions.reactivateAction(id, null)],
    ['resetMfaAction', (id: string) => actions.resetMfaAction(id, null)],
    ['deleteAction', (id: string) => actions.deleteAction(id, null)],
  ] as const;

  it.each(asks)('%s is refused for nobody signed in, and changes nothing', async (_name, ask) => {
    expect(await failure(() => ask('pat'))).toMatchObject({ code: 'unauthenticated' });
    expect(await exists('pat')).toBe(true);
  });

  it.each(asks)(
    '%s is refused for a person without user:manage, and changes nothing',
    async (_name, ask) => {
      signedInAs('quinn', ROLE_USER);
      expect(await failure(() => ask('pat'))).toMatchObject({ code: 'forbidden' });
      expect(await exists('pat')).toBe(true);
      expect(await deactivated('pat')).toBe(false);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('changeRoleAction needs role:assign, which an admin does not hold', async () => {
    signedInAs('admin', ROLE_ADMIN);
    const form = new FormData();
    form.set('role', ROLE_ADMIN);
    expect(await failure(() => actions.changeRoleAction('pat', null, form))).toMatchObject({
      code: 'forbidden',
    });
    expect((await db.run('select role from users where id = ?', ['pat'])).rows[0]?.role).toBe(
      ROLE_USER,
    );
  });
});

describe('deactivating and reactivating', () => {
  it('deactivates an ordinary account for an admin, says so, and refreshes the pages', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.deactivateAction('pat', null)).toEqual({
      ok: true,
      message: 'The account is deactivated.',
    });
    expect(await deactivated('pat')).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith('/console/accounts');
    expect(revalidatePath).toHaveBeenCalledWith('/console/accounts/pat');
    expect(await actions.deactivateAction('pat', null)).toMatchObject({
      message: 'It was already deactivated.',
    });
  });

  it('reactivates, and says when there was nothing to undo', async () => {
    signedInAs('admin', ROLE_ADMIN);
    await actions.deactivateAction('pat', null);
    expect(await actions.reactivateAction('pat', null)).toEqual({
      ok: true,
      message: 'The account can sign in again.',
    });
    expect(await deactivated('pat')).toBe(false);
    expect(await actions.reactivateAction('pat', null)).toMatchObject({
      message: 'It was not deactivated.',
    });
  });

  it('says in words, inline, when an admin asks for another admin or the owner, and changes nothing', async () => {
    signedInAs('admin', ROLE_ADMIN);
    for (const id of ['other', 'owner']) {
      expect(await actions.deactivateAction(id, null)).toEqual({
        ok: false,
        error: 'Only the owner can act on an operator account.',
      });
      expect(await deactivated(id)).toBe(false);
    }
  });

  it('says when it is for someone’s own pages, and when the account is not there', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.deactivateAction('admin', null)).toEqual({
      ok: false,
      error: 'That is for your own account pages.',
    });
    expect(await actions.deactivateAction('nobody', null)).toEqual({
      ok: false,
      error: 'There is no such account.',
    });
  });
});

describe('deleting', () => {
  it('removes an ordinary account for an admin and goes back to the list', async () => {
    signedInAs('admin', ROLE_ADMIN);
    const error = await failure(() => actions.deleteAction('pat', null));
    expect(error?.digest).toContain('NEXT_REDIRECT');
    expect(error?.digest).toContain('/console/accounts');
    expect(await exists('pat')).toBe(false);
    expect(revalidatePath).toHaveBeenCalledWith('/console/accounts');
  });

  it('is refused in words for an operator or the owner, and nothing is removed', async () => {
    signedInAs('admin', ROLE_ADMIN);
    for (const id of ['other', 'owner']) {
      expect(await actions.deleteAction(id, null)).toMatchObject({ ok: false });
      expect(await exists(id)).toBe(true);
    }
  });

  it('lets the owner delete an admin', async () => {
    signedInAs('owner', ROLE_OWNER);
    await failure(() => actions.deleteAction('other', null));
    expect(await exists('other')).toBe(false);
  });
});

describe('resetting two-factor sign-in', () => {
  it('says the holder was emailed', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.resetMfaAction('pat', null)).toEqual({
      ok: true,
      message: 'Two-factor sign-in is reset, and they have been emailed.',
    });
  });

  it('is refused for an operator the person may not act on', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.resetMfaAction('other', null)).toMatchObject({ ok: false });
  });
});

describe('changing a role', () => {
  const form = (role: unknown) => {
    const data = new FormData();
    if (role !== undefined) data.set('role', String(role));
    return data;
  };

  it('lets the owner make an ordinary account an admin, and back', async () => {
    signedInAs('owner', ROLE_OWNER);
    expect(await actions.changeRoleAction('pat', null, form(ROLE_ADMIN))).toEqual({
      ok: true,
      message: 'The role is changed.',
    });
    expect((await db.run('select role from users where id = ?', ['pat'])).rows[0]?.role).toBe(
      ROLE_ADMIN,
    );
    expect(await actions.changeRoleAction('pat', null, form(ROLE_ADMIN))).toMatchObject({
      message: 'It already had that role.',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/console/accounts/pat');
  });

  it.each([ROLE_OWNER, 'platform:superuser', '', undefined])(
    'refuses %j in words, and changes nothing',
    async (role) => {
      signedInAs('owner', ROLE_OWNER);
      expect(await actions.changeRoleAction('pat', null, form(role))).toMatchObject({ ok: false });
      expect((await db.run('select role from users where id = ?', ['pat'])).rows[0]?.role).toBe(
        ROLE_USER,
      );
    },
  );

  it('will not change the owner’s role', async () => {
    signedInAs('owner', ROLE_OWNER);
    expect(await actions.changeRoleAction('owner', null, form(ROLE_ADMIN))).toMatchObject({
      ok: false,
    });
    expect((await db.run('select role from users where id = ?', ['owner'])).rows[0]?.role).toBe(
      ROLE_OWNER,
    );
  });
});
