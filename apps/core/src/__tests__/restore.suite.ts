/**
 * The restore marker (core-app §4.4) against a real database and the real OAuth provider: what a restore ends, what it leaves, what the
 * Core API refuses after it, and that the marker only moves forward.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { authenticate, authenticateApp, type TokenDeps } from '../api/token';
import { migrateCore } from '../db/migrate';
import { recordRestore, restoredAt } from '../instance/restore';
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function restoreSuite(createDatabase: () => Promise<TestDatabase>): void {
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
    for (const table of [...TABLES, 'instance_settings']) await db.run(`delete from ${table}`);
  });

  async function instance() {
    const { auth } = makeAuthWithTasks(db);
    const owner = await signUp(auth, { name: 'Olive Owner' });
    const ada = await signUp(auth, { name: 'Ada Lovelace', email: 'ada@example.com' });
    const registry = registryFor(auth);
    const asOwner = await actorOf(auth, owner.jar);
    const { client, secret } = await registry.register(asOwner, {
      name: 'Reminders',
      redirectUris: [REDIRECT],
      scopes: ['openid', 'profile', 'directory', 'offline_access'],
      appScopes: ['notifications:send'],
    });
    const app = { clientId: client.clientId, secret: secret as string };
    return { auth, app, ada };
  }
  type Ctx = Awaited<ReturnType<typeof instance>>;

  const deps = (ctx: Ctx): TokenDeps => ({
    database: db,
    issuer: ORIGIN,
    audience: AUDIENCE,
    jwks: async () => (await ctx.auth.api.getJwks()) as never,
  });
  const withToken = (token: string) =>
    new Request(`${ORIGIN}/api/v1/directory/users`, {
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
  const personAccess = (ctx: Ctx, jar = ctx.ada.jar) =>
    personToken(ctx.auth, jar, ctx.app, { audience: AUDIENCE, scope: 'directory offline_access' });
  const appAccess = async (ctx: Ctx) => {
    const reply = await formPost(
      ctx.auth,
      '/oauth2/token',
      {
        grant_type: 'client_credentials',
        resource: AUDIENCE,
        scope: 'notifications:send',
      },
      ctx.app,
    );
    expect(reply.status).toBe(200);
    return String(reply.body.access_token);
  };
  const rows = async (sql: string) => Number((await db.run(sql)).rows[0]?.n);

  describe('recording it', () => {
    it('has no marker until a restore, then holds the time', async () => {
      expect(await restoredAt(db)).toBeUndefined();
      const restored = await recordRestore(db, 1_800_000_000_000);
      expect(restored).toEqual({ at: 1_800_000_000_000, moved: true });
      expect(await restoredAt(db)).toBe(1_800_000_000_000);
    });

    it('only moves forward: an earlier time, or the same one, changes nothing and ends nothing', async () => {
      const ctx = await instance();
      await recordRestore(db, 1_800_000_000_000);
      await personAccess(
        ctx,
        (await signUp(ctx.auth, { name: 'Bo', email: 'bo@example.com' })).jar,
      );
      const sessions = await rows('select count(*) as n from sessions');
      expect(sessions).toBeGreaterThan(0);
      for (const at of [1_700_000_000_000, 1_800_000_000_000]) {
        expect(await recordRestore(db, at)).toEqual({ at: 1_800_000_000_000, moved: false });
      }
      expect(await restoredAt(db)).toBe(1_800_000_000_000);
      expect(await rows('select count(*) as n from sessions')).toBe(sessions);
      expect(await recordRestore(db, 1_800_000_000_001)).toMatchObject({ moved: true });
    });
  });

  describe('what it ends', () => {
    it('ends every session and revokes every token the provider keeps a row for, and leaves the consent', async () => {
      const ctx = await instance();
      await personAccess(ctx);
      expect(await rows('select count(*) as n from sessions')).toBeGreaterThan(0);
      expect(
        await rows('select count(*) as n from oauth_refresh_tokens where revoked is null'),
      ).toBeGreaterThan(0);
      const consents = await rows('select count(*) as n from oauth_consents');
      expect(consents).toBeGreaterThan(0);

      await recordRestore(db);

      expect(await rows('select count(*) as n from sessions')).toBe(0);
      expect(
        await rows('select count(*) as n from oauth_access_tokens where revoked is null'),
      ).toBe(0);
      expect(
        await rows('select count(*) as n from oauth_refresh_tokens where revoked is null'),
      ).toBe(0);
      expect(await rows('select count(*) as n from oauth_consents')).toBe(consents);
    });
  });

  describe('what the Core API refuses', () => {
    it('refuses a person’s token issued before the marker, and accepts one issued after it', async () => {
      const ctx = await instance();
      const before = await personAccess(ctx);
      expect(await authenticate(deps(ctx), withToken(before), 'directory')).toMatchObject({
        clientId: ctx.app.clientId,
      });
      await recordRestore(db);
      const error = await refused(() => authenticate(deps(ctx), withToken(before), 'directory'));
      expect(error?.status).toBe(401);

      await sleep(1100);
      const bo = await signUp(ctx.auth, { name: 'Bo Barnes', email: 'bo@example.com' });
      const after = await personAccess(ctx, bo.jar);
      expect(await authenticate(deps(ctx), withToken(after), 'directory')).toMatchObject({
        clientId: ctx.app.clientId,
      });
    });

    it('refuses an app’s own token issued before the marker, and accepts one issued after it', async () => {
      const ctx = await instance();
      const before = await appAccess(ctx);
      expect(await authenticateApp(deps(ctx), withToken(before), 'notifications:send')).toEqual({
        clientId: ctx.app.clientId,
        scopes: ['notifications:send'],
      });
      await recordRestore(db);
      expect(
        (await refused(() => authenticateApp(deps(ctx), withToken(before), 'notifications:send')))
          ?.status,
      ).toBe(401);

      await sleep(1100);
      const after = await appAccess(ctx);
      expect(
        await authenticateApp(deps(ctx), withToken(after), 'notifications:send'),
      ).toMatchObject({
        clientId: ctx.app.clientId,
      });
    });

    it('refuses a token whose session opened before the marker even if the session survived', async () => {
      const ctx = await instance();
      const token = await personAccess(ctx);
      // A session that somehow outlived the sweep: the marker is written without it, as a stale backup could have left it.
      await db.run(
        `insert into instance_settings (key, value, encrypted, updated_at) values ('instance.restored_at', ?, 0, ?)`,
        [String(Date.now() + 60_000), Date.now()],
      );
      expect(
        (await refused(() => authenticate(deps(ctx), withToken(token), 'directory')))?.status,
      ).toBe(401);
    });

    it('is unchanged on an instance that was never restored', async () => {
      const ctx = await instance();
      const token = await personAccess(ctx);
      expect(await authenticate(deps(ctx), withToken(token), 'directory')).toBeDefined();
    });
  });
}
