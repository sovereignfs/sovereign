/**
 * Sending the account-deleted notices (core-app §4.5) against a real database and the real provider's keys: what is sent, what counts as
 * an answer, the schedule, giving up, that nothing is lost when a process stops, and what an operator sees.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import {
  ACCOUNT_DELETED_EVENT,
  DeletionDelivery,
  GIVE_UP_AFTER_MS,
  listUndelivered,
  resolveNotice,
  retryDelay,
  signAccountDeletedToken,
} from '../accounts/deletion-delivery';
import { queueDeletionNotice } from '../accounts/deletion-notices';
import { migrateCore } from '../db/migrate';
import { coreApiResource } from '../oauth/provider';
import { BASE_URL, makeAuthWithTasks, signUp } from './auth-harness';
import { REDIRECT, actorOf, personToken, registryFor, useDatabase } from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'account_deletion_notices',
  'activity',
  'app_mail_settings',
  'app_mail_keys',
  'notification_settings',
  'notifications',
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
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ADDRESS = 'https://reminders.sovereign.local/hooks/account-deleted';

type Sent = { url: string; init: RequestInit };

export function deletionDeliverySuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  let clock = Date.now();
  let sent: Sent[] = [];
  let log: string[] = [];
  /** What the app answers: a status, or a failure to raise. */
  let answer: () => Response | Error = () => new Response(null, { status: 204 });
  /** Runs while a send is in flight, for the tests that change the notice meanwhile. */
  let during: (() => Promise<void>) | undefined;

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
    clock = Date.now();
    sent = [];
    log = [];
    answer = () => new Response(null, { status: 204 });
    during = undefined;
    for (const table of TABLES) await db.run(`delete from ${table}`);
  });

  const stubFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} });
    await during?.();
    const reply = answer();
    if (reply instanceof Error) throw reply;
    return reply;
  }) as typeof fetch;
  const delivery = (sign?: (clientId: string, sub: string) => Promise<string>) =>
    new DeletionDelivery(
      db,
      sign ?? ((clientId, sub) => Promise.resolve(`token:${clientId}:${sub}`)),
      {
        now: () => clock,
        fetch: stubFetch,
        log: (line) => log.push(line),
      },
    );

  async function instance() {
    const { auth } = makeAuthWithTasks(db);
    const owner = await signUp(auth, { name: 'Olive Owner' });
    const ada = await signUp(auth, { name: 'Ada Lovelace', email: 'ada@sovereign.local' });
    const registry = registryFor(auth);
    const asOwner = await actorOf(auth, owner.jar);
    const { client, secret } = await registry.register(asOwner, {
      name: 'Reminders',
      redirectUris: [REDIRECT],
      scopes: ['openid', 'profile', 'directory'],
      accountDeletedUri: ADDRESS,
    });
    const app = { clientId: client.clientId, secret };
    await personToken(auth, ada.jar, app, { audience: AUDIENCE });
    const adaId = String(
      (await db.run('select id from users where email = ?', ['ada@sovereign.local'])).rows[0]?.id,
    );
    return { auth, registry, asOwner, app, adaId };
  }

  const queue = (clientId: string, sub: string, at = clock) =>
    db.transaction((tx) => queueDeletionNotice(tx, clientId, sub, at));
  const row = async (sub: string) =>
    (await db.run('select * from account_deletion_notices where sub = ?', [sub])).rows[0];

  describe('what is sent', () => {
    it('is a form post of the token to the app’s address, with a redirect not followed', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      const round = await delivery().runDue();
      expect(round).toEqual({ tried: 1, delivered: 1, failed: 0, givenUp: 0 });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.url).toBe(ADDRESS);
      expect(sent[0]?.init.method).toBe('POST');
      expect(sent[0]?.init.redirect).toBe('manual');
      expect(sent[0]?.init.signal).toBeDefined();
      expect((sent[0]?.init.headers as Record<string, string>)['content-type']).toBe(
        'application/x-www-form-urlencoded',
      );
      const body = sent[0]?.init.body as URLSearchParams;
      expect([...body.keys()]).toEqual(['account_deleted_token']);
      expect(body.get('account_deleted_token')).toBe(`token:${ctx.app.clientId}:sub-1`);
    });

    it('is a token core’s own keys signed, for this app and this person, and for nothing else', async () => {
      const ctx = await instance();
      const token = await signAccountDeletedToken(ctx.auth, ctx.app.clientId, ctx.adaId, clock);
      expect(decodeProtectedHeader(token).typ).toBe('account-deleted+jwt');
      const keys = createLocalJWKSet((await ctx.auth.api.getJwks()) as never);
      const { payload } = await jwtVerify(token, keys, {
        issuer: ORIGIN,
        audience: ctx.app.clientId,
        typ: 'account-deleted+jwt',
        currentDate: new Date(clock),
      });
      expect(Object.keys(payload).sort()).toEqual(
        ['aud', 'events', 'exp', 'iat', 'iss', 'jti', 'sub'].sort(),
      );
      expect(payload.sub).toBe(ctx.adaId);
      expect(payload.events).toEqual({ [ACCOUNT_DELETED_EVENT]: {} });
      expect(Number(payload.exp) - Number(payload.iat)).toBe(120);
      const again = await signAccountDeletedToken(ctx.auth, ctx.app.clientId, ctx.adaId, clock);
      const second = await jwtVerify(again, keys, {
        audience: ctx.app.clientId,
        currentDate: new Date(clock),
      });
      expect(second.payload.jti).not.toBe(payload.jti);
      expect(JSON.stringify(payload)).not.toContain('ada@sovereign.local');
    });

    it('tells the app after a person deletes their own account, with the sub of the deleted account', async () => {
      const ctx = await instance();
      const manager = new AccountManager(db, new AccountStates(db, { log: () => undefined }), {
        log: () => undefined,
      });
      await manager.deleteSelf({ id: ctx.adaId, role: 'platform:user' });
      clock = Date.now();
      await delivery().runDue();
      expect(sent).toHaveLength(1);
      expect((sent[0]?.init.body as URLSearchParams).get('account_deleted_token')).toBe(
        `token:${ctx.app.clientId}:${ctx.adaId}`,
      );
      expect((await row(ctx.adaId))?.state).toBe('delivered');
    });
  });

  describe('what counts as an answer', () => {
    it('is any 2xx, and it is delivered once and never sent again', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      answer = () => new Response(null, { status: 200 });
      await delivery().runDue();
      const done = await row('sub-1');
      expect(done).toMatchObject({ state: 'delivered', attempts: 1, last_failure: null });
      expect(done?.lease_until).toBeNull();
      expect(done?.next_attempt_at).toBeNull();
      expect(Number(done?.done_at)).toBe(clock);
      clock += DAY;
      await delivery().runDue();
      expect(sent).toHaveLength(1);
    });

    it.each([
      [() => new Response('no', { status: 500 }), 'http_500'],
      [() => new Response(null, { status: 404 }), 'http_404'],
      [
        () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } }),
        'http_302',
      ],
      [() => new DOMException('too slow', 'TimeoutError'), 'timeout'],
      [() => new TypeError('fetch failed'), 'network'],
    ])(
      'is not anything else, and the kind of failure is kept, not what the app said',
      async (reply, kind) => {
        const ctx = await instance();
        await queue(ctx.app.clientId, 'sub-1');
        answer = reply as () => Response | Error;
        const round = await delivery().runDue();
        expect(round).toMatchObject({ failed: 1, delivered: 0 });
        expect(await row('sub-1')).toMatchObject({
          state: 'pending',
          attempts: 1,
          last_failure: kind,
        });
        expect(sent).toHaveLength(1);
        expect(sent.map((request) => request.url)).toEqual([ADDRESS]);
      },
    );

    it('is a failure if the app no longer has an address, and is tried again', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      await ctx.registry.update(ctx.asOwner, ctx.app.clientId, { accountDeletedUri: '' });
      await delivery().runDue();
      expect(await row('sub-1')).toMatchObject({ state: 'pending', last_failure: 'no_address' });
      expect(sent).toHaveLength(0);
    });
  });

  describe('trying again', () => {
    it('waits 1 minute, 5, 30, 2 hours, 6, 12, and then a day', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      answer = () => new Response(null, { status: 503 });
      const waits: number[] = [];
      for (let i = 0; i < 8; i += 1) {
        await delivery().runDue();
        const state = await row('sub-1');
        waits.push(Number(state?.next_attempt_at) - clock);
        clock = Number(state?.next_attempt_at);
      }
      expect(waits).toEqual([
        MINUTE,
        5 * MINUTE,
        30 * MINUTE,
        120 * MINUTE,
        360 * MINUTE,
        720 * MINUTE,
        DAY,
        DAY,
      ]);
      expect([1, 2, 3, 4, 5, 6, 7, 8].map(retryDelay)).toEqual(waits);
    });

    it('does not try before it is due', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      answer = () => new Response(null, { status: 503 });
      await delivery().runDue();
      clock += 30_000;
      expect(await delivery().runDue()).toMatchObject({ tried: 0 });
      clock += 40_000;
      expect(await delivery().runDue()).toMatchObject({ tried: 1 });
    });

    it('is told when the app is back, even after a day, and is never lost by a process that stopped', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      answer = () => new Response(null, { status: 503 });
      await delivery().runDue();
      // The process stops: a new one knows only the table.
      clock += DAY;
      answer = () => new Response(null, { status: 204 });
      await delivery().runDue();
      expect(await row('sub-1')).toMatchObject({ state: 'delivered', attempts: 2 });
    });

    it('is not sent twice at once by two instances of core', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      const a = delivery();
      const b = delivery();
      await Promise.all([a.runDue(), b.runDue()]);
      expect(sent).toHaveLength(1);
    });

    it('is picked up again when a process died holding it, once the lease has run out', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      await db.run('update account_deletion_notices set lease_until = ?', [clock + 2 * MINUTE]);
      expect(await delivery().runDue()).toMatchObject({ tried: 0 });
      clock += 3 * MINUTE;
      expect(await delivery().runDue()).toMatchObject({ delivered: 1 });
    });
  });

  describe('giving up', () => {
    it('makes a last try at 30 days, and then stops, saying which app and not who', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      const deletedAt = clock;
      answer = () => new Response(null, { status: 500 });
      clock = deletedAt + GIVE_UP_AFTER_MS - 3 * 60 * MINUTE;
      await db.run('update account_deletion_notices set next_attempt_at = ?, attempts = 7', [
        clock,
      ]);
      await delivery().runDue();
      const waiting = await row('sub-1');
      expect(waiting?.state).toBe('pending');
      // The wait would run past the 30 days: the last try is at the 30 days.
      expect(Number(waiting?.next_attempt_at)).toBe(deletedAt + GIVE_UP_AFTER_MS);

      clock = deletedAt + GIVE_UP_AFTER_MS;
      const round = await delivery().runDue();
      expect(round).toMatchObject({ givenUp: 1 });
      const gone = await row('sub-1');
      expect(gone).toMatchObject({ state: 'given_up', last_failure: 'http_500' });
      expect(gone?.next_attempt_at).toBeNull();
      expect(log).toHaveLength(1);
      expect(log[0]).toContain(ctx.app.clientId);
      expect(log[0]).not.toContain('sub-1');
      sent = [];
      clock += 10 * DAY;
      await delivery().runDue();
      expect(sent).toHaveLength(0);
    });

    it('is still delivered by that last try if the app answers', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      clock += GIVE_UP_AFTER_MS;
      await delivery().runDue();
      expect((await row('sub-1'))?.state).toBe('delivered');
    });
  });

  describe('what an operator sees', () => {
    it('is what is not delivered, with eight characters of the sub, and the number given up', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'aaaaaaaa-1111-2222');
      await queue(ctx.app.clientId, 'bbbbbbbb-3333-4444');
      await queue(ctx.app.clientId, 'cccccccc-5555-6666');
      await db.run(
        "update account_deletion_notices set state = 'delivered' where sub like 'cccc%'",
      );
      await db.run(
        "update account_deletion_notices set state = 'given_up', last_failure = 'timeout' where sub like 'bbbb%'",
      );
      const { notices, givenUp } = await listUndelivered(db);
      expect(givenUp).toBe(1);
      expect(
        notices.map((notice) => [notice.subStart, notice.state, notice.appName].join(' ')).sort(),
      ).toEqual(['aaaaaaaa pending Reminders', 'bbbbbbbb given_up Reminders']);
      expect(JSON.stringify(notices)).not.toContain('1111');
    });

    it('can mark a notice done, once, and it is not sent after that', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      const id = String((await row('sub-1'))?.id);
      expect(await resolveNotice(db, id, clock)).toBe(true);
      expect(await resolveNotice(db, id, clock)).toBe(false);
      expect(await resolveNotice(db, 'no-such-notice', clock)).toBe(false);
      await delivery().runDue();
      expect(sent).toHaveLength(0);
      expect((await row('sub-1'))?.state).toBe('resolved');
      expect((await listUndelivered(db)).notices).toEqual([]);
    });

    it('is not undone by an attempt that was already on its way when it was marked done', async () => {
      const ctx = await instance();
      await queue(ctx.app.clientId, 'sub-1');
      const id = String((await row('sub-1'))?.id);
      during = async () => {
        await resolveNotice(db, id, clock);
      };
      await delivery().runDue();
      expect((await row('sub-1'))?.state).toBe('resolved');
    });
  });
}
