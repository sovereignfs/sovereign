/**
 * The Core API's token check, its counters, and the Directory's queries (core-app §3.9), against a real database
 * and the real OAuth provider. A token is issued the way an app gets one (the authorization code flow, with
 * `resource=<origin>/api/v1`), and every way it can stop being good is tried: expiry, the wrong key, the wrong kind
 * of token, a missing scope, deactivating the account, Remove access, ending the session, switching the app off
 * and deleting the account. One suite, run by `directory.test.ts` on a SQLite file and by `directory.db.test.ts`
 * on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import { authenticate, type TokenDeps } from '../api/token';
import { ApiError } from '../api/errors';
import { countCall } from '../api/rate-limit';
import { migrateCore } from '../db/migrate';
import { findUserByEmail, resolveUsers, searchUsers } from '../directory/directory';
import { revokeOnDeactivation } from '../oauth/logout';
import { coreApiResource } from '../oauth/provider';
import {
  isTokenRevoked,
  removeAccess,
  revokeClientTokens,
  revokeAllTokens,
  stamp,
} from '../oauth/revocation';
import { BASE_URL, call, makeAuthWithTasks, signUp, type Jar } from './auth-harness';
import {
  REDIRECT,
  authorize,
  formPost,
  personToken,
  pkce,
  registerClient,
  registryFor,
  actorOf,
  useDatabase,
  type RegisteredClient,
} from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'token_revocations',
  'oauth_access_tokens',
  'oauth_refresh_tokens',
  'oauth_consents',
  'oauth_client_resources',
  'oauth_clients',
  'oauth_resources',
  'jwks',
  'capability_overrides',
  'rate_limits',
  'avatars',
  'sessions',
  'accounts',
  'verifications',
  'users',
];
const ORIGIN = new URL(BASE_URL).origin;
const AUDIENCE = coreApiResource(ORIGIN);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function directorySuite(createDatabase: () => Promise<TestDatabase>): void {
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

  const idOf = async (email: string) =>
    String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);

  /** An owner and two ordinary people, and what is needed to give an app a token for one of them. */
  async function instance() {
    const { auth } = makeAuthWithTasks(db);
    const owner = await signUp(auth, { name: 'Olive Owner' });
    const ada = await signUp(auth, { name: 'Ada Lovelace', email: 'ada@sovereign.local' });
    const bo = await signUp(auth, { name: 'Bo Barnes', email: 'bo@sovereign.local' });
    const states = new AccountStates(db, { log: () => undefined });
    revokeOnDeactivation(states, () => Promise.resolve(auth));
    const manager = new AccountManager(db, states, { log: () => undefined });
    const deps = (now?: () => number): TokenDeps => ({
      database: db,
      issuer: ORIGIN,
      audience: AUDIENCE,
      jwks: async () => (await auth.api.getJwks()) as never,
      ...(now ? { now } : {}),
    });
    return {
      auth,
      owner,
      ada: { ...ada, id: await idOf(ada.email) },
      bo: { ...bo, id: await idOf(bo.email) },
      ownerId: await idOf(owner.email),
      states,
      manager,
      deps,
    };
  }
  type Ctx = Awaited<ReturnType<typeof instance>>;

  /** What an app is given for a person: the authorization code flow, asking for the Core API as the resource. */
  const tokenFor = (
    ctx: Ctx,
    jar: Jar,
    client: RegisteredClient,
    options: { trusted?: boolean; resource?: string | null; scope?: string } = {},
  ) =>
    personToken(ctx.auth, jar, client, {
      audience: AUDIENCE,
      ...(options.resource === undefined ? {} : { resource: options.resource }),
      ...(options.scope === undefined ? {} : { scope: options.scope }),
    });

  const withToken = (token: string) =>
    new Request(`${ORIGIN}/api/v1/directory/users?q=a`, {
      headers: { authorization: `Bearer ${token}` },
    });
  const refused = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return undefined;
    } catch (error) {
      if (error instanceof ApiError) return error;
      throw error;
    }
  };
  const app = (ctx: Ctx, options: { trusted?: boolean; scope?: string } = {}) =>
    registerClient(ctx.auth, ctx.owner.jar, {
      trusted: options.trusted ?? true,
      scope: options.scope ?? 'openid profile directory',
    });

  describe('a token for the Core API', () => {
    it('is accepted when it is a good one, and says who it is for', async () => {
      const ctx = await instance();
      const client = await app(ctx);
      const token = await tokenFor(ctx, ctx.ada.jar, client);
      expect(await authenticate(ctx.deps(), withToken(token), 'directory')).toEqual({
        userId: ctx.ada.id,
        clientId: client.clientId,
        scopes: ['directory'],
      });
    });

    it.each([
      ['no Authorization header', undefined],
      ['a different scheme', 'Basic dXNlcjpwYXNz'],
      ['Bearer with no token', 'Bearer '],
      ['a token with spaces in it', 'Bearer a b'],
    ])('is refused with %s, asking for a bearer token', async (_name, header) => {
      const ctx = await instance();
      const request = new Request(`${ORIGIN}/api/v1/directory/users?q=a`, {
        headers: header === undefined ? {} : { authorization: header },
      });
      const error = await refused(() => authenticate(ctx.deps(), request, 'directory'));
      expect(error).toMatchObject({ status: 401, code: 'invalid_token' });
      expect(error?.headers['www-authenticate']).toBe('Bearer realm="Sovereign API"');
    });

    it.each([
      ['not a JWT', () => 'not-a-token'],
      ['a token with a part missing', () => 'a.b'],
      ['a token far too long', () => 'x'.repeat(5000)],
    ])(
      'is refused when it is %s, naming the failure for a program to read',
      async (_name, make) => {
        const ctx = await instance();
        const error = await refused(() => authenticate(ctx.deps(), withToken(make()), 'directory'));
        expect(error).toMatchObject({ status: 401, code: 'invalid_token' });
        expect(error?.headers['www-authenticate']).toContain('error="invalid_token"');
      },
    );

    it('is refused when its signature is not one of core’s keys, however little was changed', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx));
      const [header, payload, signature] = token.split('.');
      const flipped = `${signature?.slice(0, -2)}${signature?.endsWith('AA') ? 'BB' : 'AA'}`;
      expect(
        await refused(() =>
          authenticate(ctx.deps(), withToken(`${header}.${payload}.${flipped}`), 'directory'),
        ),
      ).toMatchObject({ status: 401 });
      // A payload made to say something else is refused for the same reason: the signature covers it.
      const forged = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()),
          scope: 'directory admin',
        }),
      ).toString('base64url');
      expect(
        await refused(() =>
          authenticate(ctx.deps(), withToken(`${header}.${forged}.${signature}`), 'directory'),
        ),
      ).toMatchObject({ status: 401 });
    });

    it('is refused when it was not signed at all, or by an algorithm core does not use', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx));
      const [, payload] = token.split('.');
      const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'at+jwt' })).toString(
        'base64url',
      );
      expect(
        await refused(() =>
          authenticate(ctx.deps(), withToken(`${none}.${payload}.`), 'directory'),
        ),
      ).toMatchObject({ status: 401 });
      const hmac = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'at+jwt' })).toString(
        'base64url',
      );
      expect(
        await refused(() =>
          authenticate(ctx.deps(), withToken(`${hmac}.${payload}.AAAA`), 'directory'),
        ),
      ).toMatchObject({ status: 401 });
    });

    it('is refused when it is an opaque token, which is what asking for no resource gives', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx), { resource: null });
      expect(token.split('.')).toHaveLength(1);
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(token), 'directory')),
      ).toMatchObject({
        status: 401,
        code: 'invalid_token',
      });
    });

    it('is refused when it is an ID token, which is signed by the same keys but is not an access token', async () => {
      const ctx = await instance();
      const client = await app(ctx);
      const { verifier, challenge } = pkce();
      const authorized = await authorize(ctx.auth, ctx.ada.jar, client, {
        scope: 'openid profile',
        challenge,
      });
      const reply = await formPost(
        ctx.auth,
        '/oauth2/token',
        {
          grant_type: 'authorization_code',
          code: authorized.code as string,
          redirect_uri: REDIRECT,
          code_verifier: verifier,
        },
        client,
      );
      const idToken = String(reply.body.id_token);
      expect(idToken.split('.')).toHaveLength(3);
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(idToken), 'directory')),
      ).toMatchObject({
        status: 401,
      });
    });

    it('is refused once it has expired, and says so', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx));
      const error = await refused(() =>
        authenticate(
          ctx.deps(() => Date.now() + 16 * 60 * 1000),
          withToken(token),
          'directory',
        ),
      );
      expect(error).toMatchObject({ status: 401, message: 'The access token has expired.' });
    });

    it('is refused for another issuer or another audience, which is what a token for a different instance is', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx));
      expect(
        await refused(() =>
          authenticate(
            { ...ctx.deps(), issuer: 'https://other.sovereign.local' },
            withToken(token),
            'directory',
          ),
        ),
      ).toMatchObject({ status: 401 });
      expect(
        await refused(() =>
          authenticate(
            { ...ctx.deps(), audience: 'https://other.sovereign.local/api/v1' },
            withToken(token),
            'directory',
          ),
        ),
      ).toMatchObject({ status: 401 });
    });

    it('is refused for a scope it does not carry, naming the scope, and that is not a 401', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx));
      const error = await refused(() => authenticate(ctx.deps(), withToken(token), 'other'));
      expect(error).toMatchObject({ status: 403, code: 'insufficient_scope' });
      expect(error?.headers['www-authenticate']).toContain('scope="other"');
    });

    it('is refused when the account is deactivated, and stays refused when it is reactivated', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx));
      await authenticate(ctx.deps(), withToken(token), 'directory');
      await ctx.states.deactivate(ctx.ada.id);
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(token), 'directory')),
      ).toMatchObject({
        status: 401,
        message: 'The access token is no longer valid.',
      });
      await ctx.states.reactivate(ctx.ada.id);
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(token), 'directory')),
      ).toMatchObject({
        status: 401,
      });
    });

    it('is refused after Remove access, while another app’s token for the same person is not', async () => {
      const ctx = await instance();
      const one = await app(ctx, { trusted: false });
      const two = await app(ctx, { trusted: false });
      const first = await tokenFor(ctx, ctx.ada.jar, one);
      const second = await tokenFor(ctx, ctx.ada.jar, two);
      await removeAccess(db, ctx.ada.id, one.clientId);
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(first), 'directory')),
      ).toMatchObject({ status: 401 });
      expect((await authenticate(ctx.deps(), withToken(second), 'directory')).clientId).toBe(
        two.clientId,
      );
    });

    it('is good again for a token issued after the access was removed and allowed anew', async () => {
      const ctx = await instance();
      const client = await app(ctx, { trusted: false });
      const before = await tokenFor(ctx, ctx.ada.jar, client);
      await removeAccess(db, ctx.ada.id, client.clientId);
      // A token issued in the same second as a revocation counts as revoked, so the new one waits for the next.
      await sleep(1100);
      const after = await tokenFor(ctx, ctx.ada.jar, client);
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(before), 'directory')),
      ).toMatchObject({ status: 401 });
      expect((await authenticate(ctx.deps(), withToken(after), 'directory')).userId).toBe(
        ctx.ada.id,
      );
    });

    it('is refused when one app’s tokens for the person are revoked, but not another person’s, nor another app’s', async () => {
      const ctx = await instance();
      const one = await app(ctx);
      const two = await app(ctx);
      const adas = await tokenFor(ctx, ctx.ada.jar, one);
      const adasOther = await tokenFor(ctx, ctx.ada.jar, two);
      const bos = await tokenFor(ctx, ctx.bo.jar, one);
      await db.transaction((tx) => revokeClientTokens(tx, stamp(db), ctx.ada.id, one.clientId));
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(adas), 'directory')),
      ).toMatchObject({ status: 401 });
      expect((await authenticate(ctx.deps(), withToken(adasOther), 'directory')).userId).toBe(
        ctx.ada.id,
      );
      expect((await authenticate(ctx.deps(), withToken(bos), 'directory')).userId).toBe(ctx.bo.id);
    });

    it('is refused when every token of the person is revoked, whichever app it came from', async () => {
      const ctx = await instance();
      const one = await app(ctx);
      const two = await app(ctx);
      const first = await tokenFor(ctx, ctx.ada.jar, one);
      const second = await tokenFor(ctx, ctx.ada.jar, two);
      await db.transaction((tx) => revokeAllTokens(tx, stamp(db), ctx.ada.id));
      for (const token of [first, second]) {
        expect(
          await refused(() => authenticate(ctx.deps(), withToken(token), 'directory')),
        ).toMatchObject({ status: 401 });
      }
    });

    it('is refused once the session it was got with has ended', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx));
      await authenticate(ctx.deps(), withToken(token), 'directory');
      await call(ctx.auth, 'POST', '/sign-out', { jar: ctx.ada.jar, body: {} });
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(token), 'directory')),
      ).toMatchObject({ status: 401 });
    });

    it('is refused when the app is switched off, and good again when it is switched on', async () => {
      const ctx = await instance();
      const client = await app(ctx);
      const token = await tokenFor(ctx, ctx.ada.jar, client);
      const registry = registryFor(ctx.auth);
      const actor = await actorOf(ctx.auth, ctx.owner.jar);
      await registry.setEnabled(actor, client.clientId, false);
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(token), 'directory')),
      ).toMatchObject({ status: 401 });
      await registry.setEnabled(actor, client.clientId, true);
      expect((await authenticate(ctx.deps(), withToken(token), 'directory')).userId).toBe(
        ctx.ada.id,
      );
    });

    it('is refused when the account is deleted, and nothing of the revocation is left behind', async () => {
      const ctx = await instance();
      const token = await tokenFor(ctx, ctx.ada.jar, await app(ctx));
      await ctx.manager.deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      expect(
        await refused(() => authenticate(ctx.deps(), withToken(token), 'directory')),
      ).toMatchObject({ status: 401 });
      const left = await db.run('select count(*) as n from token_revocations where user_id = ?', [
        ctx.ada.id,
      ]);
      expect(Number(left.rows[0]?.n)).toBe(0);
    });
  });

  describe('recording what was revoked', () => {
    it('keeps the latest time for an account and an app, never an earlier one', async () => {
      const ctx = await instance();
      await db.transaction((tx) => revokeClientTokens(tx, stamp(db, 5_000_000), ctx.ada.id, 'c1'));
      await db.transaction((tx) => revokeClientTokens(tx, stamp(db, 2_000_000), ctx.ada.id, 'c1'));
      const rows = await db.run(
        'select revoked_before from token_revocations where user_id = ? and client_id = ?',
        [ctx.ada.id, 'c1'],
      );
      expect(Number(rows.rows[0]?.revoked_before)).toBe(5_000_000);
    });

    it('judges a token by the second it was issued in: the same second or earlier is revoked, a later one is not', async () => {
      const ctx = await instance();
      await db.transaction((tx) => revokeAllTokens(tx, stamp(db, 1_700_000_500_900), ctx.ada.id));
      expect(await isTokenRevoked(db, ctx.ada.id, 'c1', 1_700_000_499)).toBe(true);
      expect(await isTokenRevoked(db, ctx.ada.id, 'c1', 1_700_000_500)).toBe(true);
      expect(await isTokenRevoked(db, ctx.ada.id, 'c1', 1_700_000_501)).toBe(false);
      expect(await isTokenRevoked(db, ctx.bo.id, 'c1', 1_700_000_499)).toBe(false);
    });

    it('says nothing is revoked for an account nothing was revoked for', async () => {
      const ctx = await instance();
      expect(await isTokenRevoked(db, ctx.ada.id, 'c1', 1)).toBe(false);
    });

    it('is undone with the transaction it belongs to when that fails', async () => {
      const ctx = await instance();
      await expect(
        db.transaction(async (tx) => {
          await revokeAllTokens(tx, stamp(db), ctx.ada.id);
          throw new Error('abandoned');
        }),
      ).rejects.toThrow('abandoned');
      expect(await isTokenRevoked(db, ctx.ada.id, 'c1', 1)).toBe(false);
    });
  });

  describe('counting calls', () => {
    const WINDOW = 60_000;
    const T = 1_700_000_040_000;

    it('allows up to the limit in a window, then refuses with how long to wait', async () => {
      for (let i = 0; i < 3; i++)
        expect(await countCall(db, 'k', 3, WINDOW, T + i)).toEqual({ allowed: true });
      expect(await countCall(db, 'k', 3, WINDOW, T + 10_000)).toEqual({
        allowed: false,
        retryAfter: 50,
      });
    });

    it('keeps counting a refused call, so asking again does not make it pass', async () => {
      for (let i = 0; i < 4; i++) await countCall(db, 'k', 3, WINDOW, T);
      expect((await countCall(db, 'k', 3, WINDOW, T + 59_000)).allowed).toBe(false);
    });

    it('starts again in the next window', async () => {
      for (let i = 0; i < 4; i++) await countCall(db, 'k', 3, WINDOW, T);
      expect(await countCall(db, 'k', 3, WINDOW, T + WINDOW)).toEqual({ allowed: true });
    });

    it('counts each key by itself, and a limit of one allows exactly one', async () => {
      expect((await countCall(db, 'one', 1, WINDOW, T)).allowed).toBe(true);
      expect((await countCall(db, 'one', 1, WINDOW, T)).allowed).toBe(false);
      expect((await countCall(db, 'two', 1, WINDOW, T)).allowed).toBe(true);
    });

    it('never asks to wait less than a second, or longer than the window', async () => {
      await countCall(db, 'k', 0, WINDOW, T + WINDOW - 1);
      const refusal = await countCall(db, 'k', 0, WINDOW, T + WINDOW - 1);
      expect(refusal).toEqual({ allowed: false, retryAfter: 1 });
    });

    it('removes the rows of a window long past when a new one starts, and leaves other kinds of row alone', async () => {
      await countCall(db, 'old', 5, WINDOW, T);
      await db.run('insert into rate_limits (id, key, count, last_request) values (?, ?, 1, ?)', [
        'x',
        'confirm-password|someone',
        T,
      ]);
      await countCall(db, 'old', 5, WINDOW, T + 5 * WINDOW);
      const keys = (await db.run('select key from rate_limits order by key')).rows.map((row) =>
        String(row.key),
      );
      expect(keys).toEqual([
        `confirm-password|someone`,
        `old|${Math.floor((T + 5 * WINDOW) / WINDOW)}`,
      ]);
    });
  });

  describe('the people the Directory finds', () => {
    async function people() {
      const ctx = await instance();
      const make = async (
        name: string,
        email: string,
        extra: { image?: string; deactivated?: boolean } = {},
      ) => {
        const made = await signUp(ctx.auth, { name, email });
        const id = await idOf(made.email);
        if (extra.image) await db.run('update users set image = ? where id = ?', [extra.image, id]);
        if (extra.deactivated) await ctx.states.deactivate(id);
        return id;
      };
      return {
        ctx,
        grace: await make('Grace Hopper', 'grace@sovereign.local'),
        gracie: await make('Gracie Allen', 'gracie@sovereign.local', {
          image: '/api/avatars/x?v=1234',
        }),
        agrace: await make('Agrace Lee', 'agrace@sovereign.local'),
        gone: await make('Grace Gone', 'gone@sovereign.local', { deactivated: true }),
        pct: await make('100% Pure_Name', 'pure@sovereign.local'),
      };
    }

    it('are found by part of a name, whatever the case, best match first and then in name order', async () => {
      const found = await people();
      const result = await searchUsers(db, 'GRACE', 10, ORIGIN);
      expect(result.map((user) => user.name)).toEqual(['Grace Hopper', 'Agrace Lee']);
      expect(result[0]).toEqual({ sub: found.grace, name: 'Grace Hopper', picture: null });
    });

    it('put a name that is exactly the text before one that only starts with it', async () => {
      await people();
      const result = await searchUsers(db, 'grace hopper', 10, ORIGIN);
      expect(result.map((user) => user.name)).toEqual(['Grace Hopper']);
      await signUp((await instance()).auth, { name: 'Grace', email: 'plain@sovereign.local' });
      const both = await searchUsers(db, 'grace', 10, ORIGIN);
      expect(both[0]?.name).toBe('Grace');
    });

    it('leave out a deactivated account', async () => {
      await people();
      expect((await searchUsers(db, 'gone', 10, ORIGIN)).map((user) => user.name)).toEqual([]);
    });

    it('stop at the limit', async () => {
      await people();
      expect(await searchUsers(db, 'grace', 2, ORIGIN)).toHaveLength(2);
    });

    it('take what is typed as it is: % and _ are characters, not patterns', async () => {
      const found = await people();
      expect((await searchUsers(db, '%', 10, ORIGIN)).map((user) => user.sub)).toEqual([found.pct]);
      expect((await searchUsers(db, '_', 10, ORIGIN)).map((user) => user.sub)).toEqual([found.pct]);
      expect(await searchUsers(db, 'gr_ce', 10, ORIGIN)).toEqual([]);
      expect(await searchUsers(db, 'gr%e', 10, ORIGIN)).toEqual([]);
    });

    it('never match an email address, whole or in part', async () => {
      await people();
      for (const text of ['sovereign.local', 'grace@sovereign.local', '@example', 'grace@']) {
        expect(await searchUsers(db, text, 10, ORIGIN), text).toEqual([]);
      }
    });

    it('give the picture as an absolute address on the instance, or none', async () => {
      await people();
      const result = await searchUsers(db, 'gracie', 10, ORIGIN);
      expect(result[0]?.picture).toBe(`${ORIGIN}/api/avatars/x?v=1234`);
      expect((await searchUsers(db, 'hopper', 10, ORIGIN))[0]?.picture).toBeNull();
    });

    it('are resolved by sub, in the order asked, with whether each is active, and a deleted one left out', async () => {
      const found = await people();
      const result = await resolveUsers(
        db,
        [found.gone, 'no-such-sub', found.grace, found.gone],
        ORIGIN,
      );
      expect(result.map((user) => [user.name, user.active])).toEqual([
        ['Grace Gone', false],
        ['Grace Hopper', true],
      ]);
      expect(Object.keys(result[0] ?? {}).sort()).toEqual(['active', 'name', 'picture', 'sub']);
    });

    it('are resolved to nobody for no subs, and a deleted account is as if it never was', async () => {
      const found = await people();
      expect(await resolveUsers(db, [], ORIGIN)).toEqual([]);
      await found.ctx.manager.deleteSelf({ id: found.agrace, role: 'platform:user' });
      expect(await resolveUsers(db, [found.agrace], ORIGIN)).toEqual([]);
    });

    it('are found by the whole of an email address, whatever the case, and nobody else', async () => {
      const found = await people();
      expect((await findUserByEmail(db, 'Grace@Sovereign.LOCAL', ORIGIN))?.sub).toBe(found.grace);
      expect((await findUserByEmail(db, '  gracie@sovereign.local ', ORIGIN))?.sub).toBe(
        found.gracie,
      );
    });

    it('are not found by part of an address, a wildcard, or an address that is not theirs', async () => {
      await people();
      for (const text of [
        'grace',
        'grace@',
        '@sovereign.local',
        'sovereign.local',
        '%',
        'grace@example.%',
        'grac%@sovereign.local',
        '_race@sovereign.local',
      ]) {
        expect(await findUserByEmail(db, text, ORIGIN), text).toBeUndefined();
      }
    });

    it('are not found by email once the account is deactivated', async () => {
      await people();
      expect(await findUserByEmail(db, 'gone@sovereign.local', ORIGIN)).toBeUndefined();
    });
  });
}
