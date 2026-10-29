/**
 * What operators do with accounts (core-app §3.3.6, §3.4.3, §3.10) against a real database: finding them,
 * deactivating, reactivating, deleting and resetting two-factor sign-in, and the role rules a direct request
 * is held to as the page is. One suite, run by `account-manage.test.ts` on a SQLite file and by
 * `account-manage.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountActionError,
  AccountManager,
  getAccount,
  listAccounts,
  type AccountManagerHooks,
} from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import type { Auth } from '../auth/auth';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import { revokeOnDeactivation, sendLogoutNotices } from '../oauth/logout';
import { changeCapabilities } from '../roles/configure';
import { changeRole } from '../roles/people';
import { Jar, PASSWORD, call, freshEmail, makeAuthWithTasks, signUp } from './auth-harness';
import { refresh, registerClient, signInTo, useDatabase, userInfo } from './oauth-harness';
import { secretOf, totp } from './totp';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'oauth_access_tokens',
  'oauth_refresh_tokens',
  'oauth_consents',
  'oauth_client_resources',
  'oauth_clients',
  'oauth_resources',
  'jwks',
  'capability_overrides',
  'invites',
  'avatars',
  'passkeys',
  'two_factors',
  'rate_limits',
  'sessions',
  'accounts',
  'verifications',
  'users',
];
const APP = 'https://rp.example.com';

export function accountManageSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrateCore(db, MIGRATIONS);
    useDatabase(db);
  });
  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });
  beforeEach(async () => {
    for (const table of TABLES) await db.run(`delete from ${table}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  const idOf = async (email: string) =>
    String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
  const count = async (table: string, where = '', args: unknown[] = []) =>
    Number((await db.run(`select count(*) as n from ${table} ${where}`, args)).rows[0]?.n);
  const bool = (value: boolean) => (db.family === 'postgres' ? value : value ? 1 : 0);

  type Who = { id: string; role: string; email: string; jar: Jar };

  /** An owner, two admins, and three ordinary people, each with a password and a session. */
  async function instance(hooks: AccountManagerHooks = {}) {
    const { auth, settled } = makeAuthWithTasks(db);
    const make = async (name: string): Promise<Who> => {
      const made = await signUp(auth, { name });
      return { id: await idOf(made.email), role: ROLE_USER, email: made.email, jar: made.jar };
    };
    const owner = await make('Olive Owner');
    const people = {
      owner: { ...owner, role: ROLE_OWNER },
      admin: await make('Ada Admin'),
      otherAdmin: await make('Abe Admin'),
      pat: await make('Pat Person'),
      quinn: await make('Quinn Person'),
      rae: await make('Rae Person'),
    };
    const asOwner = { id: owner.id, role: ROLE_OWNER };
    for (const key of ['admin', 'otherAdmin'] as const) {
      await changeRole(db, asOwner, people[key].id, ROLE_ADMIN);
      people[key].role = ROLE_ADMIN;
    }
    const states = new AccountStates(db, { log: () => undefined });
    revokeOnDeactivation(states, () => Promise.resolve(auth));
    const manager = new AccountManager(db, states, { log: () => undefined, ...hooks });
    return {
      auth,
      settled,
      states,
      manager,
      people,
      asOwner,
      asAdmin: { id: people.admin.id, role: ROLE_ADMIN },
    };
  }

  const refused = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      return error instanceof AccountActionError ? error.code : error;
    }
    return undefined;
  };
  const app = async (ctx: Awaited<ReturnType<typeof instance>>) => {
    const registered = await registerClient(ctx.auth, ctx.people.owner.jar, {
      scope: 'openid profile offline_access',
      backchannelLogoutUri: `${APP}/backchannel`,
    });
    return registered;
  };

  describe('finding accounts', () => {
    async function many(n: number) {
      const { auth } = makeAuthWithTasks(db);
      for (let i = 0; i < n; i++) {
        await signUp(auth, {
          name: `Person ${String(i).padStart(2, '0')}`,
          email: `p${i}@example.com`,
        });
      }
    }

    it('lists them newest first, with what the Console shows', async () => {
      const ctx = await instance();
      const page = await listAccounts(db);
      expect(page.total).toBe(6);
      expect(page.accounts[0]?.createdAt).toBeGreaterThanOrEqual(page.accounts[5]?.createdAt ?? 0);
      const owner = page.accounts.find((a) => a.id === ctx.people.owner.id);
      expect(owner).toMatchObject({
        name: 'Olive Owner',
        email: ctx.people.owner.email,
        role: ROLE_OWNER,
        emailVerified: false,
        twoFactorEnabled: false,
        deactivatedAt: undefined,
      });
      expect(Number.isFinite(owner?.createdAt)).toBe(true);
    });

    it('finds an account by part of its name or its address, whatever the case', async () => {
      const ctx = await instance();
      expect((await listAccounts(db, { query: 'pat per' })).accounts.map((a) => a.id)).toEqual([
        ctx.people.pat.id,
      ]);
      expect((await listAccounts(db, { query: 'QUINN' })).accounts.map((a) => a.id)).toEqual([
        ctx.people.quinn.id,
      ]);
      const byAddress = await listAccounts(db, { query: ctx.people.rae.email.toUpperCase() });
      expect(byAddress.accounts.map((a) => a.id)).toEqual([ctx.people.rae.id]);
      expect((await listAccounts(db, { query: '@example.com' })).total).toBe(6);
      expect((await listAccounts(db, { query: 'nobody at all' })).accounts).toEqual([]);
    });

    it('takes what is typed as it is: % and _ and \\ are characters, never patterns', async () => {
      const { auth } = makeAuthWithTasks(db);
      await signUp(auth, { name: '100% Real', email: freshEmail() });
      await signUp(auth, { name: 'a_b', email: freshEmail() });
      await signUp(auth, { name: 'axb', email: freshEmail() });
      await signUp(auth, { name: 'back\\slash', email: freshEmail() });
      expect((await listAccounts(db, { query: '%' })).accounts.map((a) => a.name)).toEqual([
        '100% Real',
      ]);
      expect((await listAccounts(db, { query: 'a_b' })).accounts.map((a) => a.name)).toEqual([
        'a_b',
      ]);
      expect((await listAccounts(db, { query: '\\' })).accounts.map((a) => a.name)).toEqual([
        'back\\slash',
      ]);
      expect((await listAccounts(db, { query: "'; drop table users; --" })).total).toBe(0);
      expect(await count('users')).toBe(4);
    });

    it('pages, and clamps a page that is not there or not a number', async () => {
      await many(7);
      const first = await listAccounts(db, { pageSize: 3 });
      expect([first.total, first.pages, first.page, first.accounts.length]).toEqual([7, 3, 1, 3]);
      const last = await listAccounts(db, { pageSize: 3, page: 3 });
      expect(last.accounts).toHaveLength(1);
      const everyPage = await Promise.all(
        [1, 2, 3].map((page) => listAccounts(db, { pageSize: 3, page })),
      );
      const ids = new Set(everyPage.flatMap((p) => p.accounts.map((a) => a.id)));
      expect(ids.size).toBe(7);
      for (const page of [99, 0, -4, Number.NaN, Number.POSITIVE_INFINITY, 2.7]) {
        const result = await listAccounts(db, { pageSize: 3, page });
        expect(result.page).toBeGreaterThanOrEqual(1);
        expect(result.page).toBeLessThanOrEqual(3);
      }
      expect((await listAccounts(db, { pageSize: 3, page: 99 })).page).toBe(3);
      expect((await listAccounts(db, { pageSize: 3, page: 2.7 })).page).toBe(2);
    });

    it('has one empty page when there is nobody', async () => {
      expect(await listAccounts(db)).toMatchObject({ total: 0, pages: 1, page: 1, accounts: [] });
    });

    it('says who is deactivated, and who has two-factor sign-in', async () => {
      const ctx = await instance();
      await ctx.manager.deactivate(ctx.asOwner, ctx.people.pat.id);
      await db.run('update users set two_factor_enabled = ? where id = ?', [
        bool(true),
        ctx.people.quinn.id,
      ]);
      await db.run('update users set email_verified = ? where id = ?', [
        bool(true),
        ctx.people.rae.id,
      ]);
      const by = new Map((await listAccounts(db)).accounts.map((a) => [a.id, a]));
      expect(by.get(ctx.people.pat.id)?.deactivatedAt).toBeGreaterThan(0);
      expect(by.get(ctx.people.quinn.id)?.twoFactorEnabled).toBe(true);
      expect(by.get(ctx.people.rae.id)?.emailVerified).toBe(true);
      expect(by.get(ctx.people.admin.id)?.deactivatedAt).toBeUndefined();
    });

    it('gives one account in full, with its passkeys and sessions, and nothing for one that is not there', async () => {
      const ctx = await instance();
      await db.run(
        'insert into passkeys (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'pk1',
          'Laptop',
          'key',
          ctx.people.pat.id,
          'cred1',
          0,
          'multiDevice',
          bool(true),
          db.family === 'postgres' ? new Date() : Date.now(),
        ],
      );
      await db.run('update users set timezone = ?, locale = ? where id = ?', [
        'Europe/Paris',
        'fr-FR',
        ctx.people.pat.id,
      ]);
      const detail = await getAccount(db, ctx.people.pat.id);
      expect(detail).toMatchObject({
        id: ctx.people.pat.id,
        passkeys: 1,
        sessions: 1,
        timezone: 'Europe/Paris',
        locale: 'fr-FR',
      });
      expect(await getAccount(db, 'nobody')).toBeUndefined();
    });
  });

  describe('who may act on whom', () => {
    const ACTIONS = ['deactivate', 'reactivate', 'delete', 'resetMfa'] as const;

    it.each(ACTIONS)('%s: an ordinary person may do none of it, to anyone', async (action) => {
      const ctx = await instance();
      const pat = { id: ctx.people.pat.id, role: ROLE_USER };
      for (const other of [ctx.people.quinn, ctx.people.admin, ctx.people.owner]) {
        expect(await refused(() => ctx.manager[action](pat, other.id))).toBe('forbidden');
      }
      expect(await count('users')).toBe(6);
    });

    it.each(ACTIONS)('%s: an admin may do it to an ordinary person', async (action) => {
      const ctx = await instance();
      expect(
        await refused(() => ctx.manager[action](ctx.asAdmin, ctx.people.pat.id)),
      ).toBeUndefined();
    });

    it.each(ACTIONS)(
      '%s: an admin may not do it to another admin or the owner, by a direct request',
      async (action) => {
        const ctx = await instance();
        expect(
          await refused(() => ctx.manager[action](ctx.asAdmin, ctx.people.otherAdmin.id)),
        ).toBe('operator');
        expect(await refused(() => ctx.manager[action](ctx.asAdmin, ctx.people.owner.id))).toBe(
          'operator',
        );
        expect(await count('users')).toBe(6);
        expect((await getAccount(db, ctx.people.otherAdmin.id))?.deactivatedAt).toBeUndefined();
      },
    );

    it.each(ACTIONS)('%s: the owner may do it to an admin', async (action) => {
      const ctx = await instance();
      expect(
        await refused(() => ctx.manager[action](ctx.asOwner, ctx.people.otherAdmin.id)),
      ).toBeUndefined();
    });

    it.each(ACTIONS)('%s: nobody does it to themselves, the owner included', async (action) => {
      const ctx = await instance();
      expect(await refused(() => ctx.manager[action](ctx.asOwner, ctx.people.owner.id))).toBe(
        'self',
      );
      expect(await refused(() => ctx.manager[action](ctx.asAdmin, ctx.people.admin.id))).toBe(
        'self',
      );
      expect(await count('users')).toBe(6);
    });

    it.each(ACTIONS)('%s: says an account that is not there is not there', async (action) => {
      const ctx = await instance();
      expect(await refused(() => ctx.manager[action](ctx.asOwner, 'nobody'))).toBe('not-found');
    });

    it('follows the matrix in force: an admin who loses user:manage may do nothing, at once', async () => {
      const ctx = await instance();
      await changeCapabilities(db, ctx.asOwner, [
        { role: ROLE_ADMIN, capability: 'user:manage', granted: false },
      ]);
      for (const action of ACTIONS) {
        expect(await refused(() => ctx.manager[action](ctx.asAdmin, ctx.people.pat.id))).toBe(
          'forbidden',
        );
      }
    });

    it('never lets an actor with a role core does not know do anything', async () => {
      const ctx = await instance();
      for (const role of ['platform:superuser', undefined, null, '']) {
        expect(
          await refused(() => ctx.manager.deactivate({ id: 'x', role }, ctx.people.pat.id)),
        ).toBe('forbidden');
      }
    });
  });

  describe('deactivating', () => {
    it('ends the sessions, and takes back every token, so refreshing and userinfo fail', async () => {
      const ctx = await instance();
      const client = await app(ctx);
      const { tokens } = await signInTo(ctx.auth, ctx.people.pat.jar, client, {
        scope: 'openid offline_access',
      });
      expect((await userInfo(ctx.auth, String(tokens.body.access_token))).status).toBe(200);

      expect(await ctx.manager.deactivate(ctx.asAdmin, ctx.people.pat.id)).toEqual({
        changed: true,
      });

      expect(await count('sessions', 'where user_id = ?', [ctx.people.pat.id])).toBe(0);
      expect(
        (await userInfo(ctx.auth, String(tokens.body.access_token))).status,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (await refresh(ctx.auth, client, String(tokens.body.refresh_token))).status,
      ).toBeGreaterThanOrEqual(400);
      const signIn = await call(ctx.auth, 'POST', '/sign-in/email', {
        jar: new Jar(),
        body: { email: ctx.people.pat.email, password: PASSWORD },
      });
      expect(signIn.status).toBeGreaterThanOrEqual(400);
    });

    it('tells the apps, once it has committed', async () => {
      const sent: unknown[] = [];
      const ctx = await instance();
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith(APP)) {
          sent.push({ url, body: String(init?.body) });
          return new Response(null, { status: 200 });
        }
        return ctx.auth.handler(new Request(url));
      });
      const client = await app(ctx);
      await signInTo(ctx.auth, ctx.people.pat.jar, client, { scope: 'openid' });
      await ctx.manager.deactivate(ctx.asAdmin, ctx.people.pat.id);
      expect(sent).toHaveLength(1);
      expect(JSON.stringify(sent)).toContain(`${APP}/backchannel`);
    });

    it('can be undone for signing in: reactivating lets the person in, though what ended stays ended', async () => {
      const ctx = await instance();
      await ctx.manager.deactivate(ctx.asAdmin, ctx.people.pat.id);
      expect(await ctx.manager.reactivate(ctx.asAdmin, ctx.people.pat.id)).toEqual({
        changed: true,
      });
      expect(await count('sessions', 'where user_id = ?', [ctx.people.pat.id])).toBe(0);
      const signIn = await call(ctx.auth, 'POST', '/sign-in/email', {
        jar: new Jar(),
        body: { email: ctx.people.pat.email, password: PASSWORD },
      });
      expect(signIn.status).toBe(200);
      expect(await ctx.manager.reactivate(ctx.asAdmin, ctx.people.pat.id)).toEqual({
        changed: false,
      });
    });

    it('is safe to do twice', async () => {
      const ctx = await instance();
      await ctx.manager.deactivate(ctx.asAdmin, ctx.people.pat.id);
      expect(await ctx.manager.deactivate(ctx.asAdmin, ctx.people.pat.id)).toEqual({
        changed: false,
      });
    });
  });

  describe('deleting', () => {
    it('removes the account and everything that belongs to it, and leaves everyone else', async () => {
      const ctx = await instance();
      const client = await app(ctx);
      await signInTo(ctx.auth, ctx.people.pat.jar, client, { scope: 'openid offline_access' });
      await signInTo(ctx.auth, ctx.people.quinn.jar, client, { scope: 'openid offline_access' });
      const pat = ctx.people.pat.id;
      await db.run(
        'insert into passkeys (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'pk1',
          'Laptop',
          'key',
          pat,
          'cred1',
          0,
          'multiDevice',
          bool(true),
          db.family === 'postgres' ? new Date() : Date.now(),
        ],
      );

      await ctx.manager.delete(ctx.asAdmin, pat);

      expect(await getAccount(db, pat)).toBeUndefined();
      for (const table of [
        'sessions',
        'accounts',
        'passkeys',
        'two_factors',
        'avatars',
        'oauth_access_tokens',
        'oauth_refresh_tokens',
        'oauth_consents',
      ]) {
        expect(await count(table, 'where user_id = ?', [pat]), table).toBe(0);
      }
      expect(await count('users')).toBe(5);
      expect(await count('oauth_access_tokens')).toBe(1);
      expect(await getAccount(db, ctx.people.quinn.id)).toBeDefined();
    });

    it('stops every token it held, and its sign-in', async () => {
      const ctx = await instance();
      const client = await app(ctx);
      const { tokens } = await signInTo(ctx.auth, ctx.people.pat.jar, client, {
        scope: 'openid offline_access',
      });
      await ctx.manager.delete(ctx.asAdmin, ctx.people.pat.id);
      expect(
        (await userInfo(ctx.auth, String(tokens.body.access_token))).status,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (await refresh(ctx.auth, client, String(tokens.body.refresh_token))).status,
      ).toBeGreaterThanOrEqual(400);
      const signIn = await call(ctx.auth, 'POST', '/sign-in/email', {
        jar: new Jar(),
        body: { email: ctx.people.pat.email, password: PASSWORD },
      });
      expect(signIn.status).toBeGreaterThanOrEqual(400);
    });

    it('tells the apps, and one that does not answer does not undo it', async () => {
      const told: unknown[] = [];
      const ctx = await instance({
        logoutNotices: async (notices) => {
          told.push(...notices);
          throw new Error('app is down');
        },
      });
      const client = await app(ctx);
      await signInTo(ctx.auth, ctx.people.pat.jar, client, { scope: 'openid' });
      await ctx.manager.delete(ctx.asAdmin, ctx.people.pat.id);
      expect(told).toHaveLength(1);
      expect(await getAccount(db, ctx.people.pat.id)).toBeUndefined();
    });

    it('is whole or not at all: a failure leaves the account as it was', async () => {
      const ctx = await instance();
      const client = await app(ctx);
      const { tokens } = await signInTo(ctx.auth, ctx.people.pat.jar, client, {
        scope: 'openid offline_access',
      });
      // A table that does not exist makes the transaction fail part of the way through.
      await db.run('alter table avatars rename to avatars_gone');
      try {
        await expect(ctx.manager.delete(ctx.asAdmin, ctx.people.pat.id)).rejects.toThrow();
      } finally {
        await db.run('alter table avatars_gone rename to avatars');
      }
      expect(await getAccount(db, ctx.people.pat.id)).toBeDefined();
      expect(await count('sessions', 'where user_id = ?', [ctx.people.pat.id])).toBe(1);
      expect((await userInfo(ctx.auth, String(tokens.body.access_token))).status).toBe(200);
    });

    it('never reuses the sub: the same address signing up again is a new account', async () => {
      const ctx = await instance();
      const before = ctx.people.pat.id;
      await ctx.manager.delete(ctx.asAdmin, before);
      const again = await signUp(ctx.auth, { email: ctx.people.pat.email });
      expect(again.reply.status).toBe(200);
      expect(await idOf(ctx.people.pat.email)).not.toBe(before);
    });

    it('leaves the apps an operator registered, even when it was the deleted account that registered them', async () => {
      const ctx = await instance();
      await changeRole(db, ctx.asOwner, ctx.people.pat.id, ROLE_ADMIN);
      const registered = await registerClient(ctx.auth, ctx.people.pat.jar);
      await ctx.manager.delete(ctx.asOwner, ctx.people.pat.id);
      expect(await count('oauth_clients', 'where client_id = ?', [registered.clientId])).toBe(1);
    });

    it('keeps the invites the account sent, with nobody named as the sender', async () => {
      const ctx = await instance();
      await db.run('insert into invites (id, email, invited_by, created_at) values (?, ?, ?, ?)', [
        'inv1',
        'someone@example.com',
        ctx.people.pat.id,
        db.family === 'postgres' ? Date.now() : Date.now(),
      ]);
      await ctx.manager.delete(ctx.asAdmin, ctx.people.pat.id);
      const row = (await db.run('select invited_by from invites where id = ?', ['inv1'])).rows[0];
      expect(row?.invited_by).toBeNull();
    });

    it('cannot delete the owner, by anyone', async () => {
      const ctx = await instance();
      expect(await refused(() => ctx.manager.delete(ctx.asAdmin, ctx.people.owner.id))).toBe(
        'operator',
      );
      expect(await refused(() => ctx.manager.delete(ctx.asOwner, ctx.people.owner.id))).toBe(
        'self',
      );
      expect(await getAccount(db, ctx.people.owner.id)).toBeDefined();
    });
  });

  describe('resetting two-factor sign-in', () => {
    async function withTwoFactor(ctx: Awaited<ReturnType<typeof instance>>, who: Who) {
      await db.run('update users set email_verified = ? where id = ?', [bool(true), who.id]);
      const enabled = await call(ctx.auth, 'POST', '/two-factor/enable', {
        jar: who.jar,
        body: { password: PASSWORD },
      });
      const secret = secretOf(String(enabled.body.totpURI));
      await call(ctx.auth, 'POST', '/two-factor/verify-totp', {
        jar: who.jar,
        body: { code: totp(secret) },
      });
      await db.run(
        'insert into passkeys (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `pk-${who.id}`,
          'Phone',
          'key',
          who.id,
          `cred-${who.id}`,
          0,
          'singleDevice',
          bool(false),
          db.family === 'postgres' ? new Date() : Date.now(),
        ],
      );
      expect((await getAccount(db, who.id))?.twoFactorEnabled).toBe(true);
    }

    it('removes the authenticator app and the passkeys, so the password alone signs in, and tells the holder', async () => {
      const told: { email: string; name: string }[] = [];
      const ctx = await instance({
        mfaReset: async (to) => {
          told.push(to);
          return true;
        },
      });
      await withTwoFactor(ctx, ctx.people.pat);
      await withTwoFactor(ctx, ctx.people.quinn);

      expect(await ctx.manager.resetMfa(ctx.asAdmin, ctx.people.pat.id)).toEqual({
        notified: true,
      });

      expect((await getAccount(db, ctx.people.pat.id))?.twoFactorEnabled).toBe(false);
      expect(await count('two_factors', 'where user_id = ?', [ctx.people.pat.id])).toBe(0);
      expect(await count('passkeys', 'where user_id = ?', [ctx.people.pat.id])).toBe(0);
      expect(told).toEqual([{ email: ctx.people.pat.email, name: 'Pat Person' }]);
      const signIn = await call(ctx.auth, 'POST', '/sign-in/email', {
        jar: new Jar(),
        body: { email: ctx.people.pat.email, password: PASSWORD },
      });
      expect(signIn.status).toBe(200);
      expect(signIn.body.twoFactorRedirect).toBeUndefined();

      // Somebody else's are left alone.
      expect((await getAccount(db, ctx.people.quinn.id))?.twoFactorEnabled).toBe(true);
      expect(await count('passkeys', 'where user_id = ?', [ctx.people.quinn.id])).toBe(1);
    });

    it('still resets when the holder cannot be told, and says they were not', async () => {
      const ctx = await instance({
        mfaReset: () => Promise.reject(new Error('email is not set up')),
      });
      await withTwoFactor(ctx, ctx.people.pat);
      expect(await ctx.manager.resetMfa(ctx.asAdmin, ctx.people.pat.id)).toEqual({
        notified: false,
      });
      expect((await getAccount(db, ctx.people.pat.id))?.twoFactorEnabled).toBe(false);
      const quiet = await instance();
      void quiet;
    });

    it('says not told when nothing is set up to tell', async () => {
      const ctx = await instance();
      expect(await ctx.manager.resetMfa(ctx.asAdmin, ctx.people.pat.id)).toEqual({
        notified: false,
      });
    });

    it('is safe for an account that has no two-factor sign-in', async () => {
      const ctx = await instance({ mfaReset: async () => true });
      expect(await ctx.manager.resetMfa(ctx.asAdmin, ctx.people.pat.id)).toEqual({
        notified: true,
      });
    });

    it('does not end the account’s sessions, which are not what was asked', async () => {
      const ctx = await instance();
      await ctx.manager.resetMfa(ctx.asAdmin, ctx.people.pat.id);
      expect(await count('sessions', 'where user_id = ?', [ctx.people.pat.id])).toBe(1);
    });
  });

  void sendLogoutNotices;
  void ({} as Auth);
}
