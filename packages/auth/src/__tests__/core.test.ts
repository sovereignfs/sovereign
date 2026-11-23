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
  coreSignedInAt,
  needsCoreCheck,
  signedInUser,
  sovereignSignIn,
} from '../core/index';
import {
  ACCOUNT_MIGRATIONS_TABLE,
  accountMigrations,
  accountTables,
  createAuthPreset,
  resolveAuthSettings,
  keySecrets,
  signUpPolicy,
  userOf,
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

async function world(options: { localAccounts?: boolean; roles?: string[] } = {}) {
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
    scopes: ['openid', 'profile', 'email', 'offline_access', ...(options.roles ? ['roles'] : [])],
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
      plugins: [
        sovereignSignIn({ sovereign, database: db }),
        keySecrets({ database: db, core: true }),
      ],
    }),
  );
  const get = (address: string, cookie = '') =>
    auth.handler(new Request(new URL(address, APP), { headers: cookie ? { cookie } : {} }));

  /** A person signs in through core: the whole round trip, as the browser makes it. */
  async function signIn(sub = 'u1', previous = '') {
    const start = await get('/api/auth/sign-in/sovereign?returnTo=%2Fnotes', previous);
    const toCore = start.headers.get('location') as string;
    const back = core.authorize(toCore, sub, options.roles ? { roles: options.roles } : {});
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

  it('asks core for its sign-up when the app does (prompt=create), and for nothing it does not know', async () => {
    const { get } = await world();
    const create = new URL(
      (await get('/api/auth/sign-in/sovereign?prompt=create')).headers.get('location') as string,
    );
    expect(create.searchParams.get('prompt')).toBe('create');
    const junk = new URL(
      (await get('/api/auth/sign-in/sovereign?prompt=consent')).headers.get('location') as string,
    );
    expect(junk.searchParams.has('prompt')).toBe(false);
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

  it('says when the person last signed in at core, from the token core signed, and nothing for a local session', async () => {
    const { get, core, db, sessionOf } = await world();
    const signedAt = Date.now() - 7 * 60 * 1000;
    const start = await get('/api/auth/sign-in/sovereign');
    const back = core.authorize(start.headers.get('location') as string, 'u1', {
      authTime: signedAt,
    });
    const done = await get(back, cookiesOf(start));
    const sessionId = (await sessionOf(cookiesOf(done)))?.session.id as string;
    expect(await coreSignedInAt(db, sessionId)).toBe(Math.floor(signedAt / 1000) * 1000);
    expect(await coreSignedInAt(db, 'a-local-session')).toBeUndefined();
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

describe('who is signed in, typed (sdk §9.9)', () => {
  it('is the same shape for an account from core, with its sub and the roles core signed, and for one of the app’s own', async () => {
    const { signIn, sessionOf, db, auth } = await world({ roles: ['platform:admin'] });
    const { cookie } = await signIn();
    const fromCore = await sessionOf(cookie);
    expect(await signedInUser(db, fromCore as NonNullable<typeof fromCore>)).toEqual({
      id: fromCore?.user.id,
      sub: 'u1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerified: true,
      roles: ['platform:admin'],
    });

    await db.run(
      "insert into users (id, name, email, email_verified, two_factor_enabled, locale, timezone, created_at, updated_at) values ('local', 'Bea', 'bea@example.com', 1, 0, 'de-DE', 'Europe/Berlin', 0, 0)",
    );
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession('local');
    const own = await sessionOf(
      `${ctx.authCookies.sessionToken.name}=${await signed(session.token)}`,
    );
    // No sub and no roles: nothing of core is on it, and an account's own row is never where roles come from.
    expect(await signedInUser(db, own as NonNullable<typeof own>)).toEqual({
      id: 'local',
      name: 'Bea',
      email: 'bea@example.com',
      emailVerified: true,
      locale: 'de-DE',
      zoneinfo: 'Europe/Berlin',
      roles: [],
    });
  });

  it('keeps what the app holds of a person ahead of core’s claims, and fills in only what it lacks', () => {
    expect(
      userOf(
        { id: 'a', name: 'Kept', email: null, image: null, locale: null, timezone: 'UTC' },
        {
          sub: 's',
          claims: {
            sub: 's',
            name: 'Core',
            email: 'c@example.com',
            picture: 'https://core/p.png',
            locale: 'fr',
            zoneinfo: 'Europe/Paris',
            roles: 'platform:owner',
          },
        },
      ),
    ).toEqual({
      id: 'a',
      sub: 's',
      name: 'Kept',
      email: 'c@example.com',
      picture: 'https://core/p.png',
      locale: 'fr',
      zoneinfo: 'UTC',
      // `roles` that is not a list is no roles.
      roles: [],
    });
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

describe('the key secret over the package’s session (auth.md §8.1)', () => {
  const ask = (get: (address: string, cookie?: string) => Promise<Response>, cookie = '') =>
    get('/api/auth/sv/key-secret', cookie);

  it('is made once per session, keyed by core’s sub for a session that came through core, and never in the session’s own row', async () => {
    const { signIn, get, db } = await world();
    const { cookie } = await signIn();
    const first = await ask(get, cookie);
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    const body = (await first.json()) as { sub: string; secret: string };
    expect(body.sub).toBe('u1');
    expect(Buffer.from(body.secret, 'base64url')).toHaveLength(32);
    expect(((await (await ask(get, cookie)).json()) as { secret: string }).secret).toBe(
      body.secret,
    );
    // Another session of the same person has its own.
    const other = await signIn();
    expect(((await (await ask(get, other.cookie)).json()) as { secret: string }).secret).not.toBe(
      body.secret,
    );
    const { rows } = await db.run('select * from sessions');
    expect(JSON.stringify(rows)).not.toContain(body.secret);
  });

  it('is keyed by the app’s own id for a session of the app’s own account', async () => {
    const { get, auth, db } = await world();
    await db.run(
      "insert into users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) values ('local', 'Bea', 'bea@example.com', 1, 0, 0, 0)",
    );
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession('local');
    const cookie = `${ctx.authCookies.sessionToken.name}=${await signed(session.token)}`;
    expect(((await (await ask(get, cookie)).json()) as { sub: string }).sub).toBe('local');
  });

  it('goes with the session, however it ends', async () => {
    const { signIn, get, db, core, auth, tokens } = await world();
    const { cookie } = await signIn();
    await ask(get, cookie);
    expect((await db.run('select 1 from sv_key_secrets')).rows).toHaveLength(1);
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
    await notices.backChannelLogout(
      new Request(`${APP}/api/sovereign/backchannel-logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ logout_token: await core.logoutToken({ sub: 'u1' }) }),
      }),
    );
    expect((await db.run('select 1 from sv_key_secrets')).rows).toEqual([]);
    expect((await ask(get, cookie)).status).toBe(401);
  });

  it('is given to the app’s own pages only, and to nobody without a session', async () => {
    const { signIn, auth } = await world();
    const { cookie } = await signIn();
    const fromElsewhere = await auth.handler(
      new Request(new URL('/api/auth/sv/key-secret', APP), {
        headers: { cookie, 'sec-fetch-site': 'cross-site' },
      }),
    );
    expect(fromElsewhere.status).toBe(404);
    const { get } = await world();
    expect((await ask(get)).status).toBe(401);
  });
});

describe('linking an account of the app’s own to core (auth.md §8.2)', () => {
  const VALUE = `svp1.${Buffer.alloc(32, 7).toString('base64url')}`;

  /** A person with an account of the app's own, signed in: Bea, the app's first account. */
  async function local(w: Awaited<ReturnType<typeof world>>, email = 'bea@example.com') {
    const made = await w.auth.handler(
      new Request(new URL('/api/auth/sign-up/email', APP), {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: APP },
        body: JSON.stringify({ email, password: VALUE, name: 'Bea' }),
      }),
    );
    expect(made.status).toBe(200);
    return cookiesOf(made);
  }

  /** Asks to link, then goes through core as `sub`, as the browser would: the address the person ends at. */
  async function link(
    w: Awaited<ReturnType<typeof world>>,
    cookie: string,
    sub: string,
    password = VALUE,
  ) {
    const asked = await w.auth.handler(
      new Request(new URL('/api/auth/sv/link-sovereign', APP), {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: APP, cookie },
        body: JSON.stringify({ password, returnTo: '/security' }),
      }),
    );
    if (asked.status !== 200) return { asked, at: undefined };
    const { url } = (await asked.json()) as { url: string };
    const back = w.core.authorize(url, sub);
    const done = await w.get(back, [cookie, cookiesOf(asked)].join('; '));
    return { asked, at: done.headers.get('location') ?? undefined };
  }

  const coreAccountOf = async (w: Awaited<ReturnType<typeof world>>, sub: string) =>
    (
      await w.db.run(
        "select user_id from accounts where provider_id = 'sovereign' and account_id = ?",
        [sub],
      )
    ).rows[0]?.user_id;

  it('links the signed-in person’s own account to whoever signs in at core, after their password', async () => {
    const w = await world();
    const cookie = await local(w);
    const bea = (await w.sessionOf(cookie))?.user.id;
    const { at } = await link(w, cookie, 'u1');
    expect(at).toBe('/security?link=done');
    expect(await coreAccountOf(w, 'u1')).toBe(bea);
    // From now on, signing in through core opens the same account.
    const { cookie: again } = await w.signIn('u1');
    expect((await w.sessionOf(again))?.user.id).toBe(bea);
  });

  it('links nothing with a wrong password, and nothing to an account already linked', async () => {
    const w = await world();
    const cookie = await local(w);
    const { asked } = await link(
      w,
      cookie,
      'u1',
      `svp1.${Buffer.alloc(32, 8).toString('base64url')}`,
    );
    expect(asked.status).toBe(401);
    expect(await coreAccountOf(w, 'u1')).toBeUndefined();
    await link(w, cookie, 'u1');
    const { asked: second } = await link(w, cookie, 'u1');
    expect(second.status).toBe(400);
  });

  it('refuses a request from another site, before anything else', async () => {
    const w = await world();
    const cookie = await local(w);
    const asked = await w.auth.handler(
      new Request(new URL('/api/auth/sv/link-sovereign', APP), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://elsewhere.example',
          cookie,
        },
        body: JSON.stringify({ password: VALUE, returnTo: '/security' }),
      }),
    );
    expect(asked.status).toBe(403);
    expect(cookiesOf(asked)).not.toContain('sv_core_link');
  });

  it('refuses a Sovereign account another account here has, and an address another account here has', async () => {
    const w = await world();
    // Bea has the app's first account; u1 (ada@example.com) then signs in through core, and so has an account of its own here.
    const cookie = await local(w, 'bea@example.com');
    await w.signIn('u1');
    const bea = (await w.sessionOf(cookie))?.user.id;
    expect((await link(w, cookie, 'u1')).at).toBe('/security?link=taken');
    expect(await coreAccountOf(w, 'u1')).not.toBe(bea);
    // u2's address is Bea's other account's here: neither is joined to the other.
    w.core.addPerson({ sub: 'u2', name: 'Cy', email: 'cy@example.com' });
    await w.db.run(
      "insert into users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) values ('cy', 'Cy', 'cy@example.com', 1, 0, 0, 0)",
    );
    expect((await link(w, cookie, 'u2')).at).toBe('/security?link=address');
    expect(await coreAccountOf(w, 'u2')).toBeUndefined();
  });

  it('links only for the session that asked: the mark carried to another session links nothing', async () => {
    const w = await world();
    const cookie = await local(w);
    const asked = await w.auth.handler(
      new Request(new URL('/api/auth/sv/link-sovereign', APP), {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: APP, cookie },
        body: JSON.stringify({ password: VALUE, returnTo: '/security' }),
      }),
    );
    const { url } = (await asked.json()) as { url: string };
    const mark = cookiesOf(asked)
      .split('; ')
      .filter((part) => part.includes('sv_core_link'))
      .join('; ');
    // Another browser, signed in as someone else, with the mark copied into it.
    await w.db.run(
      "insert into users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) values ('dee', 'Dee', 'dee@example.com', 1, 0, 0, 0)",
    );
    const ctx = await w.auth.$context;
    const other = await ctx.internalAdapter.createSession('dee');
    const otherCookie = `${ctx.authCookies.sessionToken.name}=${await signed(other.token)}`;
    const back = w.core.authorize(url, 'u1');
    await w.get(
      back,
      [
        otherCookie,
        mark,
        cookiesOf(asked)
          .split('; ')
          .filter((p) => !p.includes('sv_core_link'))
          .join('; '),
      ].join('; '),
    );
    expect(await coreAccountOf(w, 'u1')).not.toBe('dee');
  });

  it('never links by an address that matches: without the person asking, a sign-in through core is refused', async () => {
    const w = await world();
    await local(w, 'ada@example.com');
    const { done } = await w.signIn('u1');
    expect(done.headers.get('location')).toContain('error=account_not_linked');
    expect(await coreAccountOf(w, 'u1')).toBeUndefined();
  });
});
