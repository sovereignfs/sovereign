import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const APP_ROOT = path.join(import.meta.dirname, '../..');
let folder: string;

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
// better-auth is what ends a session in the real thing (see sessions.suite.ts); here it is a stand-in that
// deletes the row, since these tests are about who may ask and whose session it is.
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('../auth', () => ({
  getAuth: () =>
    Promise.resolve({
      api: {
        revokeSession: async ({ body }: { body: { token: string } }) => {
          await db.run('delete from sessions where token = ?', [body.token]);
        },
        revokeOtherSessions: async () => {
          const signedIn = (await getSession()) as {
            user: { id: string };
            session: { id: string };
          };
          await db.run('delete from sessions where user_id = ? and id <> ?', [
            signedIn.user.id,
            signedIn.session.id,
          ]);
        },
      },
    }),
}));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path) as unknown,
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let actions: typeof import('../../app/security/actions');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-security-'));
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  actions = await import('../../app/security/actions');
});

afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const addUser = (id: string) =>
  db.run(
    'insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, 1, ?, 1, 1)',
    [id, id, `${id}@sovereign.local`, 'platform:user'],
  );
const addSession = (id: string, userId: string) =>
  db.run(
    'insert into sessions (id, expires_at, token, created_at, updated_at, user_id) values (?, ?, ?, 1, 1, ?)',
    [id, Date.now() + 1e7, `token-${id}`, userId],
  );
const sessionsOf = async (userId: string) =>
  (await db.run('select id from sessions where user_id = ? order by id', [userId])).rows.map((r) =>
    String(r.id),
  );
const signedInAs = (userId: string, sessionId: string, role: unknown = 'platform:user') =>
  getSession.mockResolvedValue({ user: { id: userId, role }, session: { id: sessionId } });
const form = new FormData();
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
};

beforeEach(async () => {
  await db.run('delete from sessions');
  await db.run('delete from users');
  await addUser('mine');
  await addUser('theirs');
  await addSession('m1', 'mine');
  await addSession('m2', 'mine');
  await addSession('m3', 'mine');
  await addSession('t1', 'theirs');
  getSession.mockReset().mockResolvedValue(null);
  revalidatePath.mockReset();
});

describe('ending a session', () => {
  it('ends one of the caller’s own, and refreshes the page', async () => {
    signedInAs('mine', 'm1');
    expect(await actions.endSessionAction('m2', null, form)).toEqual({ ok: true });
    expect(await sessionsOf('mine')).toEqual(['m1', 'm3']);
    expect(revalidatePath).toHaveBeenCalledWith('/security');
  });

  it('can end the one in use', async () => {
    signedInAs('mine', 'm1');
    expect(await actions.endSessionAction('m1', null, form)).toEqual({ ok: true });
    expect(await sessionsOf('mine')).toEqual(['m2', 'm3']);
  });

  it('cannot end someone else’s, however it is named, and says it is gone', async () => {
    signedInAs('mine', 'm1');
    expect(await actions.endSessionAction('t1', null, form)).toEqual({
      ok: false,
      error: 'That session has already ended.',
    });
    expect(await sessionsOf('theirs')).toEqual(['t1']);
  });

  it('says it is gone for a session that does not exist', async () => {
    signedInAs('mine', 'm1');
    expect(await actions.endSessionAction('nope', null, form)).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('ending the others', () => {
  it('ends all but the one in use, and says how many', async () => {
    signedInAs('mine', 'm2');
    expect(await actions.endOtherSessionsAction(null, form)).toEqual({
      ok: true,
      message: 'Ended 2 other sessions.',
    });
    expect(await sessionsOf('mine')).toEqual(['m2']);
    expect(await sessionsOf('theirs')).toEqual(['t1']);
  });

  it('says so when there were none, and uses the singular for one', async () => {
    signedInAs('theirs', 't1');
    expect(await actions.endOtherSessionsAction(null, form)).toMatchObject({
      message: 'There were no other sessions.',
    });
    await addSession('t2', 'theirs');
    expect(await actions.endOtherSessionsAction(null, form)).toMatchObject({
      message: 'Ended 1 other session.',
    });
  });
});

describe('called directly, as a public endpoint', () => {
  it.each([
    ['endSessionAction', () => actions.endSessionAction('m2', null, form)],
    ['endOtherSessionsAction', () => actions.endOtherSessionsAction(null, form)],
  ])('%s is refused for nobody signed in, and does nothing', async (_name, run) => {
    expect(await failure(run)).toMatchObject({ code: 'unauthenticated' });
    expect(await sessionsOf('mine')).toEqual(['m1', 'm2', 'm3']);
  });

  it.each([
    ['endSessionAction', () => actions.endSessionAction('m2', null, form)],
    ['endOtherSessionsAction', () => actions.endOtherSessionsAction(null, form)],
  ])('%s is refused for a role without profile:manage, and does nothing', async (_name, run) => {
    signedInAs('mine', 'm1', 'platform:superuser');
    expect(await failure(run)).toMatchObject({ code: 'forbidden' });
    expect(await sessionsOf('mine')).toEqual(['m1', 'm2', 'm3']);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
