import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connect, migrate, type Database } from '@sovereignfs/database';
import { createSovereign } from '@sovereignfs/sdk';
import { createFakeCore, memorySessionStore } from '@sovereignfs/sdk/testing';
import { betterAuth } from 'better-auth';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CORE_SIGN_IN_MIGRATIONS_TABLE,
  coreNotices,
  coreSignInMigrations,
  coreSignOutUrl,
  needsCoreCheck,
  sovereignSignIn,
} from '../core/index';
import {
  ACCOUNT_MIGRATIONS_TABLE,
  accountMigrations,
  accountTables,
  createAuthPreset,
  resolveAuthSettings,
  signUpPolicy,
} from '../server/index';

// Core as a way in for an app (auth.md §8), end to end in one process: a better-auth of the app's on the package's tables, the SDK
// against its fake core, and the plugin between them. Each test has its own SQLite file.
const APP = 'https://notes.sovereign.local';
const SECRET = 'a-secret-of-at-least-thirty-two-characters';

/** A session token signed as better-auth signs its cookie. */
async function signed(token: string): Promise<string> {
  const { makeSignature } = await import('better-auth/crypto');
  return encodeURIComponent(`${token}.${await makeSignature(token, SECRET)}`);
}
const opened: { db: Database; folder: string }[] = [];

afterEach(async () => {
  for (const { db, folder } of opened.splice(0)) {
    await db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .filter((cookie) => !/Max-Age=0\b/i.test(cookie))
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

async function world(options: { localAccounts?: boolean } = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), 'sv-auth-core-'));
  const db = await connect({
    dialect: 'sqlite',
    url: `file:${path.join(folder, 'app.db')}`,
    path: path.join(folder, 'app.db'),
  });
  opened.push({ db, folder });
  await migrate(db, accountMigrations('sqlite'), { table: ACCOUNT_MIGRATIONS_TABLE });
  await migrate(db, coreSignInMigrations('sqlite'), { table: CORE_SIGN_IN_MIGRATIONS_TABLE });

  const core = createFakeCore({ url: 'https://core.sovereign.local' });
  core.addPerson({ sub: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' });
  const tokens = new Map<string, string>();
  const sovereign = createSovereign({
    appUrl: APP,
    coreUrl: core.url,
    ...core.credentials,
    redirectPath: '/api/auth/callback/sovereign',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    sessionStore: memorySessionStore(),
    tokenStore: {
      read: (sub) => tokens.get(sub),
      write: (sub, next) => {
        tokens.set(sub, next);
        return true;
      },
    },
    fetch: core.fetch,
  });
  const settings = resolveAuthSettings(
    {
      url: APP,
      authSecret: { reveal: () => SECRET },
      authTrustedOrigins: [],
      authTrustedProxies: [],
      authCookieDomain: undefined,
      authPasswordMinLength: 8,
      authPasswordRequireUppercase: false,
      authPasswordRequireLowercase: false,
      authPasswordRequireNumber: false,
      authPasswordRequireSymbol: false,
      authRequireEmailVerification: false,
      authWebauthnRpId: undefined,
      authWebauthnRpName: undefined,
      authWebauthnOrigin: [],
    },
    { prefix: 'NOTES', appName: 'Notes' },
  );
  const auth = betterAuth(
    createAuthPreset({
      appName: 'Notes',
      database: db,
      tables: accountTables('sqlite'),
      settings,
      mail: {
        unavailable: () => Promise.resolve(undefined),
        verification: () => Promise.resolve(),
        passwordReset: () => Promise.resolve(),
        accountCreated: () => Promise.resolve(),
      },
      // Closed to sign-ups of the app's own: who may sign in through core is core's to say.
      registration: signUpPolicy(db, 'closed'),
      ...(options.localAccounts === false ? { localAccounts: false } : {}),
      plugins: [sovereignSignIn({ sovereign, database: db })],
    }),
  );
  const get = (address: string, cookie = '') =>
    auth.handler(new Request(new URL(address, APP), { headers: cookie ? { cookie } : {} }));

  /** A person signs in through core: the whole round trip, as the browser makes it. */
  async function signIn(sub = 'u1', previous = '') {
    const start = await get('/api/auth/sign-in/sovereign?returnTo=%2Fnotes', previous);
    const toCore = start.headers.get('location') as string;
    const back = core.authorize(toCore, sub);
    const pending = cookiesOf(start);
    const done = await get(back, [previous, pending].filter(Boolean).join('; '));
    return { start, done, cookie: cookiesOf(done) };
  }
  const sessionOf = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) });
  return { db, core, auth, tokens, sovereign, get, signIn, sessionOf };
}

describe('signing in through core (auth.md §8)', () => {
  it('opens the app’s own session for the account linked to core’s sub, and sends the person where they were going', async () => {
    const { signIn, sessionOf, db } = await world();
    const { done, cookie } = await signIn();
    expect(done.status).toBe(302);
    expect(done.headers.get('location')).toBe('/notes');
    const session = await sessionOf(cookie);
    expect(session?.user).toMatchObject({ email: 'ada@example.com', name: 'Ada Lovelace' });
    const { rows } = await db.run(
      "select account_id from accounts where provider_id = 'sovereign'",
    );
    expect(rows.map((row) => row.account_id)).toEqual(['u1']);
  });

  it('keeps core’s refresh token in the SDK’s store alone: no account row holds one', async () => {
    const { signIn, tokens, db } = await world();
    await signIn();
    expect(tokens.get('u1')).toBeTypeOf('string');
    const { rows } = await db.run('select access_token, refresh_token, id_token from accounts');
    for (const row of rows) {
      expect(row.access_token ?? null).toBeNull();
      expect(row.refresh_token ?? null).toBeNull();
      expect(row.id_token ?? null).toBeNull();
    }
  });

  it('lets a callback finish one sign-in, once', async () => {
    const { get, core } = await world();
    const start = await get('/api/auth/sign-in/sovereign');
    const back = core.authorize(start.headers.get('location') as string, 'u1');
    const pending = cookiesOf(start);
    expect((await get(back, pending)).headers.get('location')).toBe('/');
    expect((await get(back, pending)).headers.get('location')).toMatch(
      /^\/sign-in\?error=sovereign/,
    );
  });

  it('signs in through core though the app’s own sign-up is closed, and signs the same person in to the same account again', async () => {
    const { signIn, sessionOf, db } = await world();
    const first = await signIn();
    const second = await signIn('u1');
    expect((await sessionOf(second.cookie))?.user.id).toBe(
      (await sessionOf(first.cookie))?.user.id,
    );
    expect((await db.run('select count(*) as n from users')).rows[0]?.n).toBe(1);
  });

  it('refuses an address that is already a local account’s, until the two are linked', async () => {
    const { signIn, db } = await world();
    await db.run(
      "insert into users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) values ('local', 'Ada', 'ada@example.com', 1, 0, 0, 0)",
    );
    const { done } = await signIn();
    expect(done.headers.get('location')).toBe(
      '/sign-in?returnTo=%2Fnotes&error=account_not_linked',
    );
  });

  it('ends the session that came from core when core says the person is signed out (sdk §9.7)', async () => {
    const { signIn, sessionOf, get, core } = await world();
    const { cookie } = await signIn();
    const start = await get('/api/auth/sign-in/sovereign?prompt=none&returnTo=%2Fnotes', cookie);
    const back = core.loginRequired(start.headers.get('location') as string);
    const done = await get(back, `${cookie}; ${cookiesOf(start)}`);
    expect(done.headers.get('location')).toBe('/sign-in?returnTo=%2Fnotes');
    expect(await sessionOf(cookie)).toBeNull();
  });

  it('leaves a session that did not come from core alone, whatever core says', async () => {
    const { sessionOf, get, core, auth, db } = await world();
    await db.run(
      "insert into users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) values ('local', 'Bea', 'bea@example.com', 1, 0, 0, 0)",
    );
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession('local');
    const cookie = `${ctx.authCookies.sessionToken.name}=${await signed(session.token)}`;
    expect(await sessionOf(cookie)).not.toBeNull();
    const start = await get('/api/auth/sign-in/sovereign?prompt=none', cookie);
    const back = core.loginRequired(start.headers.get('location') as string);
    await get(back, `${cookie}; ${cookiesOf(start)}`);
    expect(await sessionOf(cookie)).not.toBeNull();
  });

  it('says when a session is due a check against core, and where signing out sends the person', async () => {
    const { signIn, sessionOf, db, sovereign } = await world();
    const { cookie } = await signIn();
    const sessionId = (await sessionOf(cookie))?.session.id as string;
    expect(await needsCoreCheck(db, sessionId)).toBe(false);
    expect(await needsCoreCheck(db, sessionId, Date.now() + 2 * 60 * 60 * 1000)).toBe(true);
    expect(await needsCoreCheck(db, 'a-local-session')).toBe(false);
    const out = new URL((await coreSignOutUrl(db, sovereign, sessionId)) as string);
    expect(out.searchParams.get('id_token_hint')).toBeTruthy();
    expect(await coreSignOutUrl(db, sovereign, 'a-local-session')).toBeUndefined();
  });

  it('gives an account from core no password, second step or passkey of the app’s', async () => {
    const { signIn, auth } = await world();
    const { cookie } = await signIn();
    const refused = await auth.handler(
      new Request(`${APP}/api/auth/two-factor/enable`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', origin: APP },
        body: JSON.stringify({ password: 'anything' }),
      }),
    );
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code?: string }).code).toBe('NO_PASSWORD_ACCOUNT');
  });

  it('switches every route of an own account off when the app has none', async () => {
    const { auth } = await world({ localAccounts: false });
    const response = await auth.handler(
      new Request(`${APP}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: APP },
        body: JSON.stringify({ email: 'a@b.c', password: 'x' }),
      }),
    );
    expect(response.status).toBe(404);
  });
});

describe('core’s notices (auth.md §8)', () => {
  const notice = (token: string) =>
    new Request(`${APP}/api/sovereign/backchannel-logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ logout_token: token }),
    });

  it('end the sessions of the core session a logout notice names, once, and every session of a person it names whole', async () => {
    const { signIn, sessionOf, core, auth, db, tokens } = await world();
    const first = await signIn();
    const second = await signIn();
    const notices = coreNotices({
      database: db,
      auth,
      coreUrl: core.url,
      clientId: core.credentials.clientId,
      fetch: core.fetch,
      dropRefreshToken: (sub) => {
        tokens.delete(sub);
        return Promise.resolve();
      },
    });
    const sid = core.sessionIdOf('u1') as string;
    const token = await core.logoutToken({ sid });
    expect((await notices.backChannelLogout(notice(token))).status).toBe(200);
    expect(await sessionOf(second.cookie)).toBeNull();
    // A replay ends nothing more, and is refused.
    expect((await notices.backChannelLogout(notice(token))).status).toBe(400);
    expect(await sessionOf(first.cookie)).not.toBeNull();
    expect(tokens.get('u1')).toBeTypeOf('string');

    expect(
      (await notices.backChannelLogout(notice(await core.logoutToken({ sub: 'u1' })))).status,
    ).toBe(200);
    expect(await sessionOf(first.cookie)).toBeNull();
    expect(tokens.has('u1')).toBe(false);
  });

  it('refuse a notice that is wrong, and run the app’s deletion before answering an account-deleted one', async () => {
    const { signIn, sessionOf, core, auth, db } = await world();
    const { cookie } = await signIn();
    const deleted: string[] = [];
    const notices = coreNotices({
      database: db,
      auth,
      coreUrl: core.url,
      clientId: core.credentials.clientId,
      fetch: core.fetch,
      onAccountDeleted: (sub) => {
        deleted.push(sub);
        return Promise.resolve();
      },
    });
    const wrong = await core.logoutToken({ sub: 'u1' }, { wrong: 'audience' });
    expect((await notices.backChannelLogout(notice(wrong))).status).toBe(400);
    const gone = await notices.accountDeleted(
      new Request(`${APP}/api/sovereign/account-deleted`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          account_deleted_token: await core.accountDeletedToken({ sub: 'u1' }),
        }),
      }),
    );
    expect(gone.status).toBe(200);
    expect(deleted).toEqual(['u1']);
    expect(await sessionOf(cookie)).toBeNull();
  });
});
