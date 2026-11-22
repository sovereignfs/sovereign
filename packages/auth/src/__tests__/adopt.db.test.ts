import { migrate, type Database } from '@sovereignfs/database';
import { createTestDatabase, type TestDatabase } from '@sovereignfs/database/testing';
import { betterAuth } from 'better-auth';
import { hashPassword } from 'better-auth/crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CORE_SIGN_IN_MIGRATIONS_TABLE,
  coreSignInMigrations,
  coreSubOf,
  needsCoreCheck,
  userIdForSub,
} from '../core/index';
import {
  ACCOUNT_MIGRATIONS_TABLE,
  accountMigrations,
  accountTables,
  adoptAccountTables,
  createAuthPreset,
  LEGACY_PASSWORD_PERIOD_MS,
  movePasswords,
  passwordsMoving,
  resetLink,
  resolveAuthSettings,
  signUpPolicy,
} from '../server/index';
import { APP_AUTH_STORE } from './app-auth-store';

/**
 * Moving an app's own better-auth store onto the package (RFC 0007 amendment 1, auth.md §8.1), on the dialect the run names: a store as
 * the suite's apps made it before the package, with a person of each kind and a session each, moved, and then signed in to through a
 * real better-auth on the package's preset.
 */
const APP = 'https://notes.sovereign.local';
const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const NOW = Date.UTC(2026, 10, 22);
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'the password Ada always used';

/** A sign-in value as a page derives one: `svp1.` and 43 base64url characters. */
const value = (n: number) => `svp1.${Buffer.alloc(32, n).toString('base64url')}`;

const opened: { db: Database; target: TestDatabase }[] = [];
afterEach(async () => {
  for (const { db, target } of opened.splice(0)) {
    await db.close();
    await target.cleanup();
  }
});

/** Statements of a migration's text, split as the runner splits them. */
const statements = (sql: string) =>
  sql
    .split('--> statement-breakpoint')
    .map((each) => each.trim())
    .filter(Boolean);

/** An app's store as it was before the package: its own tables, four people, a session each. */
async function appStore() {
  const target = await createTestDatabase();
  const db = await target.open();
  opened.push({ db, target });
  const pg = db.family === 'postgres';
  for (const statement of statements(pg ? APP_AUTH_STORE.postgres : APP_AUTH_STORE.sqlite))
    await db.run(statement);
  const at = (ms: number) => (pg ? new Date(ms) : ms);
  const bool = (yes: boolean) => (pg ? yes : yes ? 1 : 0);
  const person = async (id: string, email: string, twoFactor = false) =>
    db.run(
      `insert into ${pg ? '"user"' : '`user`'} (id, name, email, email_verified, image, created_at, updated_at, two_factor_enabled) values (?, ?, ?, ?, null, ?, ?, ?)`,
      [
        id,
        id,
        email,
        bool(true),
        at(NOW - 100 * DAY),
        at(NOW - 100 * DAY),
        twoFactor ? bool(true) : null,
      ],
    );
  const account = async (
    userId: string,
    provider: string,
    accountId: string,
    password: string | null,
    tokens = false,
  ) =>
    db.run(
      `insert into account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, password, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${userId}-${provider}`,
        accountId,
        provider,
        userId,
        tokens ? 'an access token' : null,
        tokens ? 'a refresh token' : null,
        tokens ? 'an id token' : null,
        password,
        at(NOW - 100 * DAY),
        at(NOW - 100 * DAY),
      ],
    );
  const session = async (userId: string) =>
    db.run(
      `insert into ${pg ? '"session"' : '`session`'} (id, expires_at, token, created_at, updated_at, user_id) values (?, ?, ?, ?, ?, ?)`,
      [`s-${userId}`, at(NOW + 5 * DAY), `token-${userId}`, at(NOW - DAY), at(NOW - DAY), userId],
    );
  const hash = await hashPassword(PASSWORD);
  // Ada: a password, stored as a hash of the password itself.
  await person('ada', 'ada@example.com');
  await account('ada', 'credential', 'ada', hash);
  // Grace: only through core, with the tokens genericOAuth kept.
  await person('grace', 'grace@example.com');
  await account('grace', 'sovereign', 'u-grace', null, true);
  // Linus: a password and core both.
  await person('linus', 'linus@example.com');
  await account('linus', 'credential', 'linus', hash);
  await account('linus', 'sovereign', 'u-linus', null, true);
  // Tess: a password and the second step.
  await person('tess', 'tess@example.com', true);
  await account('tess', 'credential', 'tess', hash);
  await db.run(
    'insert into two_factor (id, secret, backup_codes, user_id, verified, failed_verification_count) values (?, ?, ?, ?, null, null)',
    ['tf-tess', 'a secret', 'codes', 'tess'],
  );
  for (const id of ['ada', 'grace', 'linus', 'tess']) await session(id);
  return db;
}

const coreMigrations = {
  migrate: (db: Database) =>
    migrate(db, coreSignInMigrations(db.family), { table: CORE_SIGN_IN_MIGRATIONS_TABLE }),
};

/** The app's better-auth on the moved store, with the move route, as an app on the package runs it. */
function authOn(db: Database, now = () => NOW) {
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
      tables: accountTables(db.family),
      settings,
      mail: {
        unavailable: () => Promise.resolve(undefined),
        verification: () => Promise.resolve(),
        passwordReset: () => Promise.resolve(),
        accountCreated: () => Promise.resolve(),
      },
      registration: signUpPolicy(db, 'closed'),
      plugins: [movePasswords({ database: db, now })],
    }),
  );
  const post = (path: string, body: unknown, origin = APP) =>
    auth.handler(
      new Request(new URL(`/api/auth${path}`, APP), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}`,
        },
        body: JSON.stringify(body),
      }),
    );
  const signIn = (email: string, password: string) => post('/sign-in/email', { email, password });
  const move = (email: string, previous: string, signIn: string, origin?: string) =>
    post('/sv/move-password', { email, previous, signIn }, origin);
  return { auth, signIn, move };
}

const passwordOf = async (db: Database, userId: string) =>
  String(
    (
      await db.run(
        "select password from accounts where user_id = ? and provider_id = 'credential'",
        [userId],
      )
    ).rows[0]?.password,
  );

describe('moving an app’s own store onto the package', () => {
  it('renames its tables, keeps every row, and records the package’s first migration as run', async () => {
    const db = await appStore();
    expect(await adoptAccountTables(db, { core: coreMigrations, now: NOW })).toBe('moved');
    const count = async (table: string) =>
      Number((await db.run(`select count(*) as n from ${table}`)).rows[0]?.n);
    expect(await count('users')).toBe(4);
    expect(await count('accounts')).toBe(5);
    expect(await count('sessions')).toBe(4);
    expect(await count('two_factors')).toBe(1);
    expect(await count('passkeys')).toBe(0);
    const { rows } = await db.run(
      'select timezone, locale, deactivated_at from users where id = ?',
      ['ada'],
    );
    expect(rows[0]).toMatchObject({ timezone: null, locale: null, deactivated_at: null });
    // The package's migrations find their first one done and add the rest; a second start does nothing.
    const again = await migrate(db, accountMigrations(db.family), {
      table: ACCOUNT_MIGRATIONS_TABLE,
    });
    expect(again.applied).toEqual([]);
    expect(await adoptAccountTables(db, { core: coreMigrations, now: NOW })).toBe('done');
  });

  it('marks every account with a password for 90 days, and only those', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const { rows } = await db.run(
      'select user_id, until from sv_legacy_passwords order by user_id',
    );
    expect(rows.map((row) => [row.user_id, Number(row.until)])).toEqual([
      ['ada', NOW + LEGACY_PASSWORD_PERIOD_MS],
      ['linus', NOW + LEGACY_PASSWORD_PERIOD_MS],
      ['tess', NOW + LEGACY_PASSWORD_PERIOD_MS],
    ]);
    expect(await passwordsMoving(db, NOW)).toBe(true);
    expect(await passwordsMoving(db, NOW + LEGACY_PASSWORD_PERIOD_MS)).toBe(false);
  });

  it('keeps the accounts from core, clears the tokens genericOAuth kept, and checks a core-only session at its next request', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const { rows } = await db.run(
      "select access_token, refresh_token, id_token from accounts where provider_id = 'sovereign'",
    );
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect([row.access_token, row.refresh_token, row.id_token]).toEqual([null, null, null]);
    expect(await userIdForSub(db, 'u-grace')).toBe('grace');
    expect(await coreSubOf(db, 'grace')).toBe('u-grace');
    expect(await coreSubOf(db, 'linus')).toBe('u-linus');
    expect(await coreSubOf(db, 'ada')).toBeUndefined();
    // Grace's session is checked against core next; Linus's cannot be told from a local one and is left as it is.
    expect(await needsCoreCheck(db, 's-grace', NOW)).toBe(true);
    expect(await needsCoreCheck(db, 's-linus', NOW)).toBe(false);
  });

  it('keeps a session’s key secret apart, and drops it with the session', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    await db.run('insert into sv_key_secrets (session_id, secret, created_at) values (?, ?, ?)', [
      's-ada',
      'a secret',
      NOW,
    ]);
    await db.run('delete from sessions where id = ?', ['s-ada']);
    expect((await db.run('select 1 from sv_key_secrets')).rows).toEqual([]);
  });

  it('does nothing to a store with no accounts of its own yet', async () => {
    const target = await createTestDatabase();
    const db = await target.open();
    opened.push({ db, target });
    expect(await adoptAccountTables(db, { now: NOW })).toBe('none');
  });
});

describe('a password stored before the package, moved at the next sign-in', () => {
  it('does not sign in with the sign-in value until it is moved, then does, once, and is unmarked', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const { signIn, move } = authOn(db);
    expect((await signIn('ada@example.com', value(1))).status).toBe(401);
    const moved = await move('ada@example.com', PASSWORD, value(1));
    expect(moved.status).toBe(200);
    expect(await moved.json()).toEqual({ ok: true });
    const after = await signIn('ada@example.com', value(1));
    expect(after.status).toBe(200);
    expect(after.headers.getSetCookie().some((cookie) => cookie.includes('session_token'))).toBe(
      true,
    );
    expect(
      (await db.run('select 1 from sv_legacy_passwords where user_id = ?', ['ada'])).rows,
    ).toEqual([]);
    // Moved once: the old password moves nothing any more.
    await move('ada@example.com', PASSWORD, value(2));
    expect((await signIn('ada@example.com', value(2))).status).toBe(401);
  });

  it('answers a wrong password, an address with no account and an unmarked one alike, and changes nothing', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const { move } = authOn(db);
    const before = await passwordOf(db, 'ada');
    for (const [email, previous] of [
      ['ada@example.com', 'not the password'],
      ['nobody@example.com', PASSWORD],
      ['grace@example.com', PASSWORD],
    ] as const) {
      const answer = await move(email, previous, value(3));
      expect([answer.status, await answer.json()], email).toEqual([200, { ok: true }]);
    }
    expect(await passwordOf(db, 'ada')).toBe(before);
  });

  it('never stores a value that is not a sign-in value, nor takes one as what was sent before', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const { move, signIn } = authOn(db);
    const before = await passwordOf(db, 'ada');
    await move('ada@example.com', PASSWORD, 'a typed password');
    await move('ada@example.com', value(4), value(4));
    expect(await passwordOf(db, 'ada')).toBe(before);
    expect((await signIn('ada@example.com', 'a typed password')).status).toBe(401);
  });

  it('does not let a sign-in value stand for what was sent before, where an account already stores one (Shopper’s moved accounts)', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    // Marked like every account with a password, though its hash is already of a sign-in value.
    await db.run(
      "update accounts set password = ? where user_id = 'ada' and provider_id = 'credential'",
      [await hashPassword(value(9))],
    );
    const { move, signIn } = authOn(db);
    await move('ada@example.com', value(9), value(10));
    expect((await signIn('ada@example.com', value(10))).status).toBe(401);
    expect((await signIn('ada@example.com', value(9))).status).toBe(200);
  });

  it('moves nothing once the 90 days are over: then only a reset signs the person in', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const later = NOW + LEGACY_PASSWORD_PERIOD_MS + DAY;
    const { auth, move, signIn } = authOn(db, () => later);
    await move('ada@example.com', PASSWORD, value(5));
    expect((await signIn('ada@example.com', value(5))).status).toBe(401);
    const link = await resetLink(auth, 'ada@example.com', APP, { now: Date.now() });
    expect(link).toMatch(/^https:\/\/notes\.sovereign\.local\/reset-password\?token=/);
    const token = new URL(link as string).searchParams.get('token');
    const reset = await auth.handler(
      new Request(new URL('/api/auth/reset-password', APP), {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: APP },
        body: JSON.stringify({ newPassword: value(6), token }),
      }),
    );
    expect(reset.status).toBe(200);
    expect((await signIn('ada@example.com', value(6))).status).toBe(200);
    expect(await resetLink(auth, 'nobody@example.com', APP)).toBeUndefined();
  });

  it('still asks for the second step after the move: moving opens no session', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const { move, signIn } = authOn(db);
    const moved = await move('tess@example.com', PASSWORD, value(7));
    expect(moved.headers.getSetCookie().filter((cookie) => !/Max-Age=0\b/i.test(cookie))).toEqual(
      [],
    );
    const after = await signIn('tess@example.com', value(7));
    expect(after.status).toBe(200);
    expect(await after.json()).toMatchObject({ twoFactorRedirect: true });
  });

  it('gives an address five tries an hour, from wherever they come, and then moves nothing', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const { move, signIn } = authOn(db, () => Date.now());
    for (let n = 0; n < 5; n += 1) await move('ada@example.com', `wrong ${n}`, value(11));
    // The right password, but the sixth try this hour: nothing moves.
    await move('ada@example.com', PASSWORD, value(11));
    expect((await signIn('ada@example.com', value(11))).status).toBe(401);
  });

  it('refuses a request from another origin', async () => {
    const db = await appStore();
    await adoptAccountTables(db, { core: coreMigrations, now: NOW });
    const { move } = authOn(db);
    const before = await passwordOf(db, 'ada');
    expect(
      (await move('ada@example.com', PASSWORD, value(8), 'https://elsewhere.example')).status,
    ).toBe(403);
    expect(await passwordOf(db, 'ada')).toBe(before);
  });
});
