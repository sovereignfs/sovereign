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

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let actions: typeof import('../../app/console/settings/actions');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-console-settings-'));
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_FIELD_ENCRYPTION_KEYS', `k1:${Buffer.alloc(32, 7).toString('base64')}`);
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  actions = await import('../../app/console/settings/actions');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const signedInAs = (id: string, role: unknown) =>
  getSession.mockResolvedValue({ user: { id, role }, session: { id: `s-${id}` } });
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};
const saved = async () =>
  Object.fromEntries(
    (await db.run('select key, value, encrypted from instance_settings')).rows.map((row) => [
      String(row.key),
      row,
    ]),
  );
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { code?: string };
  }
  return undefined;
};

const SMTP = {
  host: 'mail.example.com',
  port: '587',
  user: 'mailer',
  from: 'noreply@example.com',
  password: 'hunter2-hunter2',
};

beforeEach(async () => {
  await db.run('delete from instance_settings');
  await db.run('delete from capability_overrides');
  (await import('../roles/matrix')).invalidateCapabilityMatrix();
  getSession.mockReset().mockResolvedValue(null);
  revalidatePath.mockReset();
});

describe('what an operator asks of the instance, as a public endpoint', () => {
  it('refuses every action for nobody signed in, and saves nothing', async () => {
    for (const call of [
      () => actions.saveNameAction(null, form({ name: 'Acme' })),
      () => actions.resetNameAction(null),
      () => actions.saveInviteOnlyAction(null, form({ inviteOnly: 'false' })),
      () => actions.resetInviteOnlyAction(null),
      () => actions.saveSmtpAction(null, form(SMTP)),
      () => actions.resetSmtpAction(null),
    ]) {
      expect(await failure(call)).toMatchObject({ code: 'unauthenticated' });
    }
    expect(await saved()).toEqual({});
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses every action for an ordinary person', async () => {
    signedInAs('pat', ROLE_USER);
    for (const call of [
      () => actions.saveNameAction(null, form({ name: 'Acme' })),
      () => actions.saveInviteOnlyAction(null, form({ inviteOnly: 'false' })),
      () => actions.saveSmtpAction(null, form(SMTP)),
    ]) {
      expect(await failure(call)).toMatchObject({ code: 'forbidden' });
    }
    expect(await saved()).toEqual({});
  });

  it('keeps the mail settings from an admin, however the request is made', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await failure(() => actions.saveSmtpAction(null, form(SMTP)))).toMatchObject({
      code: 'forbidden',
    });
    expect(await failure(() => actions.resetSmtpAction(null))).toMatchObject({
      code: 'forbidden',
    });
    expect(await saved()).toEqual({});
  });
});

describe('the name', () => {
  it('saves it, says so, and refreshes every page that shows it', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.saveNameAction(null, form({ name: '  Acme  ' }))).toEqual({
      ok: true,
      message: 'The name is saved.',
    });
    expect((await saved())['instance.name']?.value).toBe('Acme');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('says in words, inline, what is wrong with a name, and saves nothing', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.saveNameAction(null, form({ name: '   ' }))).toEqual({
      ok: false,
      error: 'The name must be 1 to 100 characters, on one line.',
    });
    expect(await saved()).toEqual({});
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('is cleared back to the default', async () => {
    signedInAs('owner', ROLE_OWNER);
    await actions.saveNameAction(null, form({ name: 'Acme' }));
    expect(await actions.resetNameAction(null)).toEqual({
      ok: true,
      message: 'The name is back to the default.',
    });
    expect(await saved()).toEqual({});
  });
});

describe('sign-up', () => {
  it('saves who can sign up, in words that say what it now means', async () => {
    signedInAs('admin', ROLE_ADMIN);
    expect(await actions.saveInviteOnlyAction(null, form({ inviteOnly: 'false' }))).toEqual({
      ok: true,
      message: 'Anyone can sign up without an invitation.',
    });
    expect((await saved())['auth.invite_only']?.value).toBe('false');
    expect(await actions.saveInviteOnlyAction(null, form({ inviteOnly: 'true' }))).toEqual({
      ok: true,
      message: 'Only people you invite can sign up.',
    });
  });

  it('takes only true or false, so a missing field never opens sign-up', async () => {
    signedInAs('admin', ROLE_ADMIN);
    const attempts: Record<string, string>[] = [
      {},
      { inviteOnly: '' },
      { inviteOnly: 'off' },
      { inviteOnly: '0' },
    ];
    for (const values of attempts) {
      expect(await actions.saveInviteOnlyAction(null, form(values))).toEqual({
        ok: false,
        error: 'Choose who can sign up.',
      });
    }
    expect(await saved()).toEqual({});
  });

  it('returns to the server’s setting', async () => {
    signedInAs('admin', ROLE_ADMIN);
    await actions.saveInviteOnlyAction(null, form({ inviteOnly: 'false' }));
    expect((await actions.resetInviteOnlyAction(null)).ok).toBe(true);
    expect(await saved()).toEqual({});
  });
});

describe('the mail settings', () => {
  it('saves them for the owner, the password encrypted', async () => {
    signedInAs('owner', ROLE_OWNER);
    expect(await actions.saveSmtpAction(null, form(SMTP))).toEqual({
      ok: true,
      message: 'The email settings are saved.',
    });
    const rows = await saved();
    expect(rows['smtp.host']?.value).toBe('mail.example.com');
    expect(rows['smtp.port']?.value).toBe('587');
    expect(Number(rows['smtp.password']?.encrypted)).toBe(1);
    expect(String(rows['smtp.password']?.value)).not.toContain(SMTP.password);
  });

  it('keeps the password when it is left blank, removes it when asked, and not otherwise', async () => {
    signedInAs('owner', ROLE_OWNER);
    await actions.saveSmtpAction(null, form(SMTP));
    await actions.saveSmtpAction(null, form({ ...SMTP, password: '', clearPassword: '' }));
    expect((await saved())['smtp.password']).toBeDefined();
    await actions.saveSmtpAction(null, form({ ...SMTP, password: '', clearPassword: 'on' }));
    expect((await saved())['smtp.password']).toBeUndefined();
  });

  it('says in words what is wrong, and saves nothing', async () => {
    signedInAs('owner', ROLE_OWNER);
    expect(await actions.saveSmtpAction(null, form({ ...SMTP, port: '99999' }))).toEqual({
      ok: false,
      error: 'The port is a number from 1 to 65535.',
    });
    expect(await saved()).toEqual({});
  });

  it('forgets everything saved about mail', async () => {
    signedInAs('owner', ROLE_OWNER);
    await actions.saveSmtpAction(null, form(SMTP));
    expect((await actions.resetSmtpAction(null)).ok).toBe(true);
    expect(await saved()).toEqual({});
  });
});
