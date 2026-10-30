/**
 * An app acting for itself (core-app §3.6.6) against a real database and the real OAuth provider: who may hold the grant, what the
 * token is, what the Core API checks of it, and what ends it.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { authenticate, authenticateApp, type TokenDeps } from '../api/token';
import type { ClientRegistryError } from '../clients/registry';
import { migrateCore } from '../db/migrate';
import { coreApiResource } from '../oauth/provider';
import { BASE_URL, makeAuthWithTasks, signUp } from './auth-harness';
import {
  REDIRECT,
  actorOf,
  formPost,
  personToken,
  registryFor,
  useDatabase,
} from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'app_token_revocations',
  'managed_clients',
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
  'sessions',
  'accounts',
  'verifications',
  'users',
];
const ORIGIN = new URL(BASE_URL).origin;
const AUDIENCE = coreApiResource(ORIGIN);

export function appTokensSuite(createDatabase: () => Promise<TestDatabase>): void {
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

  async function instance() {
    const { auth } = makeAuthWithTasks(db);
    const owner = await signUp(auth);
    const registry = registryFor(auth);
    const asOwner = await actorOf(auth, owner.jar);
    const make = async (extra: Record<string, unknown> = {}) => {
      const { client, secret } = await registry.register(asOwner, {
        name: 'Reminders',
        redirectUris: ['https://reminders.example.test/cb'],
        scopes: ['openid', 'profile'],
        appScopes: ['notifications:send'],
        ...extra,
      });
      return { clientId: client.clientId, secret: secret as string };
    };
    return { auth, registry, asOwner, make };
  }

  const tokenFor = async (
    ctx: Awaited<ReturnType<typeof instance>>,
    app: { clientId: string; secret: string },
    fields: Record<string, string> = {},
  ) =>
    formPost(
      ctx.auth,
      '/oauth2/token',
      { grant_type: 'client_credentials', resource: AUDIENCE, ...fields },
      app,
    );

  const SCOPE = 'notifications:send';
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const withToken = (token: string) =>
    new Request(`${ORIGIN}/api/v1/notifications`, {
      method: 'POST',
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
  const deps = (ctx: Awaited<ReturnType<typeof instance>>, now?: () => number): TokenDeps => ({
    database: db,
    issuer: ORIGIN,
    audience: AUDIENCE,
    jwks: async () => (await ctx.auth.api.getJwks()) as never,
    ...(now ? { now } : {}),
  });
  const good = async (
    ctx: Awaited<ReturnType<typeof instance>>,
    app: { clientId: string; secret: string },
  ) => {
    const reply = await tokenFor(ctx, app, { scope: SCOPE });
    expect(reply.status).toBe(200);
    return String(reply.body.access_token);
  };

  describe('the grant', () => {
    it('gives an app that was given an app scope a token for itself, and nothing of a person', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const reply = await tokenFor(ctx, app, { scope: SCOPE });
      expect(reply.status).toBe(200);
      expect(reply.body).toMatchObject({ token_type: 'Bearer', scope: SCOPE, expires_in: 900 });
      expect(reply.body.refresh_token).toBeUndefined();
      expect(reply.body.id_token).toBeUndefined();
      const claims = decodeJwt(String(reply.body.access_token));
      expect(claims).toMatchObject({
        sub: app.clientId,
        client_id: app.clientId,
        aud: AUDIENCE,
        scope: SCOPE,
      });
      expect(claims.sid).toBeUndefined();
      expect(Object.keys(claims).sort()).toEqual(
        ['aud', 'azp', 'client_id', 'exp', 'iat', 'iss', 'jti', 'scope', 'sub'].sort(),
      );
    });

    it('gives the scopes it was given when it asks for none', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const reply = await tokenFor(ctx, app);
      expect(reply.status).toBe(200);
      expect(reply.body.scope).toBe(SCOPE);
    });

    it('refuses an app that was given none, which is every app until an operator says', async () => {
      const ctx = await instance();
      const app = await ctx.make({ appScopes: [] });
      const reply = await tokenFor(ctx, app, { scope: SCOPE });
      expect(reply.status).toBe(400);
      expect(reply.body.error).toBe('unauthorized_client');
    });

    it('refuses a public app, which has no secret, and will not register one with app scopes', async () => {
      const ctx = await instance();
      const error = (await ctx
        .make({ type: 'public' })
        .catch((e: unknown) => e)) as ClientRegistryError;
      expect(error.code).toBe('invalid');
      expect(error.problems.map((problem) => problem.field)).toContain('appScopes');
      const none = await ctx.make({ type: 'public', appScopes: [] });
      const reply = await formPost(
        ctx.auth,
        '/oauth2/token',
        { grant_type: 'client_credentials', resource: AUDIENCE },
        { clientId: none.clientId, secret: undefined },
      );
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(reply.body.access_token).toBeUndefined();
    });

    it('can never be given `directory` or any scope about a person', async () => {
      const ctx = await instance();
      for (const scope of [
        'directory',
        'openid',
        'profile',
        'email',
        'roles',
        'offline_access',
        'anything',
      ]) {
        const error = (await ctx
          .make({ appScopes: [scope] })
          .catch((e: unknown) => e)) as ClientRegistryError;
        expect(error.code, scope).toBe('invalid');
      }
      const app = await ctx.make();
      for (const scope of ['directory', 'openid', 'offline_access', `${SCOPE} directory`]) {
        const reply = await tokenFor(ctx, app, { scope });
        expect(reply.status, scope).toBe(400);
        expect(reply.body.error, scope).toBe('invalid_scope');
      }
    });

    it('is not a thing a person can be asked to grant: an app scope in an authorization is ignored', async () => {
      const ctx = await instance();
      const person = await signUp(ctx.auth);
      const { clientId, secret } = await ctx.make({
        trusted: true,
        redirectUris: [REDIRECT],
        scopes: ['openid', 'profile', 'directory'],
      });
      const token = await personToken(
        ctx.auth,
        person.jar,
        { clientId, secret },
        { audience: AUDIENCE, scope: `directory ${SCOPE}` },
      );
      expect(decodeJwt(token).scope).toBe('directory');
    });

    it('is refused with the wrong secret, and shows nothing about which part was wrong', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const reply = await tokenFor(ctx, { ...app, secret: 'not-the-secret' }, { scope: SCOPE });
      expect(reply.status).toBe(401);
      expect(reply.body.error).toBe('invalid_client');
    });

    it('gives a token the Core API refuses when no resource was asked for', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const reply = await formPost(
        ctx.auth,
        '/oauth2/token',
        { grant_type: 'client_credentials', scope: SCOPE },
        app,
      );
      const token = String(reply.body.access_token ?? '');
      expect(token.split('.')).not.toHaveLength(3);
      expect(
        (await refused(() => authenticateApp(deps(ctx), withToken(token), SCOPE)))?.status,
      ).toBe(401);
    });
  });

  describe('what the Core API checks', () => {
    it('accepts a good token and says which app it is', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      expect(await authenticateApp(deps(ctx), withToken(await good(ctx, app)), SCOPE)).toEqual({
        clientId: app.clientId,
        scopes: [SCOPE],
      });
    });

    it('refuses the app’s token where a person’s is needed', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const token = await good(ctx, app);
      const error = await refused(() => authenticate(deps(ctx), withToken(token), SCOPE));
      expect(error?.status).toBe(401);
    });

    it('refuses a person’s token where the app’s own is needed, even one that carries the scope', async () => {
      const ctx = await instance();
      const person = await signUp(ctx.auth);
      const { clientId, secret } = await ctx.make({
        trusted: true,
        redirectUris: [REDIRECT],
        scopes: ['openid', 'profile', 'directory'],
      });
      const token = await personToken(
        ctx.auth,
        person.jar,
        { clientId, secret },
        { audience: AUDIENCE },
      );
      const error = await refused(() => authenticateApp(deps(ctx), withToken(token), SCOPE));
      expect(error?.status).toBe(401);
      expect((await authenticate(deps(ctx), withToken(token), 'directory')).clientId).toBe(
        clientId,
      );
    });

    it('refuses a token without the scope the call needs, naming it', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const token = await good(ctx, app);
      const error = await refused(() => authenticateApp(deps(ctx), withToken(token), 'directory'));
      expect(error?.status).toBe(403);
      expect(error?.headers['www-authenticate']).toContain('scope="directory"');
    });

    it('refuses an expired token, and says so', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const token = await good(ctx, app);
      const error = await refused(() =>
        authenticateApp(
          deps(ctx, () => Date.now() + 16 * 60_000),
          withToken(token),
          SCOPE,
        ),
      );
      expect(error?.status).toBe(401);
      expect(error?.message).toMatch(/expired/);
    });

    it('stops the moment an operator takes the scope away, though the token still carries it', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const token = await good(ctx, app);
      await ctx.registry.update(ctx.asOwner, app.clientId, { appScopes: [] });
      expect(
        (await refused(() => authenticateApp(deps(ctx), withToken(token), SCOPE)))?.status,
      ).toBe(403);
    });
  });

  describe('what ends one', () => {
    it('is rotating the secret: the old tokens go at once, and the new secret gets new ones', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const other = await ctx.make({ name: 'Other' });
      const token = await good(ctx, app);
      const othersToken = await good(ctx, other);
      const secret = await ctx.registry.rotateSecret(ctx.asOwner, app.clientId);
      expect(
        (await refused(() => authenticateApp(deps(ctx), withToken(token), SCOPE)))?.status,
      ).toBe(401);
      // Another app is not touched.
      expect((await authenticateApp(deps(ctx), withToken(othersToken), SCOPE)).clientId).toBe(
        other.clientId,
      );
      expect((await tokenFor(ctx, app, { scope: SCOPE })).status).toBe(401);
      // A token made in the second of the rotation counts as revoked, so the app waits it out.
      await sleep(1100);
      const fresh = await good(ctx, { clientId: app.clientId, secret });
      expect((await authenticateApp(deps(ctx), withToken(fresh), SCOPE)).clientId).toBe(
        app.clientId,
      );
    });

    it('is switching the app off: its tokens go at once, and switching it on does not bring them back', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const token = await good(ctx, app);
      await ctx.registry.setEnabled(ctx.asOwner, app.clientId, false);
      expect(
        (await refused(() => authenticateApp(deps(ctx), withToken(token), SCOPE)))?.status,
      ).toBe(401);
      expect((await tokenFor(ctx, app, { scope: SCOPE })).status).toBeGreaterThanOrEqual(400);
      await ctx.registry.setEnabled(ctx.asOwner, app.clientId, true);
      expect(
        (await refused(() => authenticateApp(deps(ctx), withToken(token), SCOPE)))?.status,
      ).toBe(401);
      await sleep(1100);
      expect(
        (await authenticateApp(deps(ctx), withToken(await good(ctx, app)), SCOPE)).clientId,
      ).toBe(app.clientId);
    });

    it('is deleting the app', async () => {
      const ctx = await instance();
      const app = await ctx.make();
      const token = await good(ctx, app);
      await ctx.registry.remove(ctx.asOwner, app.clientId);
      expect(
        (await refused(() => authenticateApp(deps(ctx), withToken(token), SCOPE)))?.status,
      ).toBe(401);
    });
  });
}
