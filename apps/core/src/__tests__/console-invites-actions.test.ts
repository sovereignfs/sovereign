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
let actions: typeof import('../../app/console/invites/actions');
const sent: { id: string; email: string; expiresAt: Date | undefined }[] = [];
let mailReady = true;

// The real manager on a real database; only the email is left out.
vi.mock('../invites/service', async (original) => {
  const real = await original<typeof import('../invites/service')>();
  const manage = await import('../invites/manage');
  return {
    ...real,
    inviteLink: (id: string) => Promise.resolve(`http://localhost:3000${real.invitePath(id)}`),
    getInviteManager: async () => {
      const { getDatabase } = await import('../database');
      return new manage.InviteManager(await getDatabase(), {
        log: () => undefined,
        send: (invite) => {
          if (!mailReady) return Promise.resolve(false);
          sent.push(invite);
          return Promise.resolve(true);
        },
      });
    },
  };
});

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-console-invites-'));
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  actions = await import('../../app/console/invites/actions');
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
const invitations = async () => (await db.run('select * from invites order by created_at')).rows;
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  return undefined;
};

beforeEach(async () => {
  for (const table of ['invites', 'sessions', 'users']) await db.run(`delete from ${table}`);
  await add('owner', ROLE_OWNER);
  await add('admin', ROLE_ADMIN);
  await add('pat', ROLE_USER);
  getSession.mockReset().mockResolvedValue(null);
  revalidatePath.mockReset();
  sent.length = 0;
  mailReady = true;
});

describe('what an operator asks of invitations, as a public endpoint', () => {
  it('refuses both actions for nobody signed in, and changes nothing', async () => {
    expect(
      await failure(() => actions.inviteAction(null, form({ email: 'a@sovereign.local' }))),
    ).toMatchObject({ code: 'unauthenticated' });
    expect(await failure(() => actions.cancelInviteAction('anything', null))).toMatchObject({
      code: 'unauthenticated',
    });
    expect(await invitations()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('refuses both actions for a person without user:manage, and changes nothing', async () => {
    signedInAs('pat', ROLE_USER);
    expect(
      await failure(() => actions.inviteAction(null, form({ email: 'a@sovereign.local' }))),
    ).toMatchObject({ code: 'forbidden' });
    signedInAs('admin', ROLE_ADMIN);
    await actions.inviteAction(null, form({ email: 'kept@sovereign.local' }));
    const id = String((await invitations())[0]?.id);
    signedInAs('pat', ROLE_USER);
    expect(await failure(() => actions.cancelInviteAction(id, null))).toMatchObject({
      code: 'forbidden',
    });
    expect((await invitations())[0]?.cancelled_at ?? null).toBeNull();
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });
});

describe('inviting', () => {
  it('saves the invitation, emails it, says so, and refreshes the page', async () => {
    signedInAs('admin', ROLE_ADMIN);
    const result = await actions.inviteAction(
      null,
      form({ email: 'New@Sovereign.local', days: '7' }),
    );
    expect(result).toEqual({
      ok: true,
      message: 'We have emailed an invitation to new@sovereign.local.',
    });
    const [row] = await invitations();
    expect(row).toMatchObject({ email: 'new@sovereign.local', invited_by: 'admin' });
    expect(Number(row?.expires_at) - Number(row?.created_at)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.id).toBe(row?.id);
    expect(revalidatePath).toHaveBeenCalledWith('/console/invites');
  });

  it('treats an empty number of days as no expiry', async () => {
    signedInAs('owner', ROLE_OWNER);
    await actions.inviteAction(null, form({ email: 'a@sovereign.local', days: '' }));
    expect((await invitations())[0]?.expires_at ?? null).toBeNull();
    await actions.inviteAction(null, form({ email: 'b@sovereign.local' }));
    expect((await invitations()).at(-1)?.expires_at ?? null).toBeNull();
  });

  it('gives the link to pass on when email is not set up, and keeps the invitation', async () => {
    mailReady = false;
    signedInAs('owner', ROLE_OWNER);
    const result = await actions.inviteAction(
      null,
      form({ email: 'a@sovereign.local', days: '3' }),
    );
    const id = String((await invitations())[0]?.id);
    expect(result).toEqual({
      ok: true,
      message:
        'a@sovereign.local is invited, but email is not set up, so nothing was sent. Pass this link on yourself:',
      link: `http://localhost:3000/invite/${id}`,
    });
  });

  it.each([
    ['not an address', { email: 'nope', days: '7' }, 'That is not an email address.'],
    ['no address', { days: '7' }, 'That is not an email address.'],
    [
      'a number of days that is not one',
      { email: 'a@sovereign.local', days: 'soon' },
      'Choose a whole number of days from 1 to 365, or leave it empty for no expiry.',
    ],
    [
      'zero days',
      { email: 'a@sovereign.local', days: '0' },
      'Choose a whole number of days from 1 to 365, or leave it empty for no expiry.',
    ],
    [
      'an address with an account',
      { email: 'pat@sovereign.local' },
      'There is already an account for that email address.',
    ],
  ])('says in words, inline, for %s, and saves and sends nothing', async (_name, values, error) => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.inviteAction(null, form(values))).toEqual({ ok: false, error });
    expect(await invitations()).toEqual([]);
    expect(sent).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('does not take the address from anything but the form field', async () => {
    signedInAs('admin', ROLE_ADMIN);
    const data = new FormData();
    data.set('email', new File(['a@sovereign.local'], 'a.txt'));
    expect(await actions.inviteAction(null, data)).toMatchObject({ ok: false });
    expect(await invitations()).toEqual([]);
  });
});

describe('cancelling', () => {
  it('cancels, says so, and refreshes; says when it was already done', async () => {
    signedInAs('admin', ROLE_ADMIN);
    await actions.inviteAction(null, form({ email: 'a@sovereign.local' }));
    const id = String((await invitations())[0]?.id);
    revalidatePath.mockReset();
    expect(await actions.cancelInviteAction(id, null)).toEqual({
      ok: true,
      message: 'The invitation is cancelled.',
    });
    expect((await invitations())[0]?.cancelled_at).not.toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith('/console/invites');
    expect(await actions.cancelInviteAction(id, null)).toEqual({
      ok: true,
      message: 'It was already cancelled.',
    });
  });

  it('says in words when there is no such invitation, and when it was used', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.cancelInviteAction('nope', null)).toEqual({
      ok: false,
      error: 'There is no such invitation.',
    });
    await actions.inviteAction(null, form({ email: 'a@sovereign.local' }));
    const id = String((await invitations())[0]?.id);
    await db.run('update invites set accepted_at = 1 where id = ?', [id]);
    expect(await actions.cancelInviteAction(id, null)).toEqual({
      ok: false,
      error: 'That invitation has already been used.',
    });
  });
});
