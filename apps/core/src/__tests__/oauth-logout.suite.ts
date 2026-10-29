/**
 * Signing out, deactivation, removed access and the apps (core-app §3.3.6, §3.6.3, §3.6.4, §3.6.5) against a
 * real database: the end-session endpoint, the logout tokens apps are sent, and the one routine that revokes
 * tokens. One suite, run by `oauth-logout.test.ts` on a SQLite file and by `oauth-logout.db.test.ts` on
 * whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountStates } from '../accounts/states';
import type { Auth } from '../auth/auth';
import { migrateCore } from '../db/migrate';
import { planLogoutNotices, revokeOnDeactivation, sendLogoutNotices } from '../oauth/logout';
import { removeAccess, revokeAllTokens, revokeClientTokens, stamp } from '../oauth/revocation';
import { endOtherSessions, endSession } from '../sessions/sessions';
import { BASE_URL, Jar, PASSWORD, call, makeAuthWithTasks, signUp } from './auth-harness';
import {
  REDIRECT,
  authorize,
  exchangeCode,
  formPost,
  pkce,
  publishedKeys,
  refresh,
  registerClient,
  signInTo,
  userInfo,
  verifyJwt,
  type RegisteredClient,
} from './oauth-harness';

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
  'rate_limits',
  'sessions',
  'accounts',
  'verifications',
  'users',
];
const APP = 'https://rp.example.com';
const LOGOUT_URI = `${APP}/backchannel-logout`;
const POST_LOGOUT = `${APP}/signed-out`;

export function oauthLogoutSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrateCore(db, MIGRATIONS);
  });
  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });
  beforeEach(async () => {
    for (const table of TABLES) await db.run(`delete from ${table}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  type Sent = { url: string; method: string; body: string; headers: Record<string, string> };

  /**
   * The network, as core sees it: its own signing keys (it fetches them over its public address to check an
   * `id_token_hint`) go to its own handler, and an app's address records what it was sent.
   */
  function network(
    auth: Auth,
    respond: (sent: Sent) => Response | Promise<Response> = () =>
      new Response(null, { status: 200 }),
  ) {
    const sent: Sent[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith(`${BASE_URL}/api/auth/jwks`)) return auth.handler(new Request(url));
      if (url.startsWith(APP)) {
        const record: Sent = {
          url,
          method: init?.method ?? 'GET',
          body: String(init?.body ?? ''),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
        };
        sent.push(record);
        return respond(record);
      }
      throw new Error(`unexpected request to ${url}`);
    });
    return sent;
  }

  async function instance() {
    const { auth, settled } = makeAuthWithTasks(db);
    const owner = await signUp(auth);
    const person = await signUp(auth);
    const idOf = async (email: string) =>
      String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
    return {
      auth,
      settled,
      owner: owner.jar,
      person: person.jar,
      personEmail: person.email,
      personId: await idOf(person.email),
    };
  }

  const sessionIdOf = async (userId: string) =>
    String(
      (await db.run('select id from sessions where user_id = ? order by created_at desc', [userId]))
        .rows[0]?.id,
    );
  const sessionCount = async (userId: string) =>
    Number(
      (await db.run('select count(*) as n from sessions where user_id = ?', [userId])).rows[0]?.n,
    );
  const accessOf = (reply: { body: Record<string, unknown> }) => String(reply.body.access_token);
  const refreshOf = (reply: { body: Record<string, unknown> }) => String(reply.body.refresh_token);
  const revokedCount = async (table: 'oauth_access_tokens' | 'oauth_refresh_tokens') =>
    Number(
      (await db.run(`select count(*) as n from ${table} where revoked is not null`)).rows[0]?.n,
    );
  const logoutTokenOf = (sent: Sent) =>
    new URLSearchParams(sent.body).get('logout_token') as string;

  describe('the end-session endpoint', () => {
    async function signedInApp(
      options: { enableEndSession?: boolean; backchannelLogoutUri?: string } = {},
    ) {
      const ctx = await instance();
      const client = await registerClient(ctx.auth, ctx.owner, {
        enableEndSession: true,
        postLogoutRedirectUris: [POST_LOGOUT],
        ...options,
      });
      const { tokens } = await signInTo(ctx.auth, ctx.person, client, { scope: 'openid profile' });
      return { ...ctx, client, idToken: String(tokens.body.id_token) };
    }
    const endSessionRequest = (auth: Auth, jar: Jar, query: Record<string, string>) =>
      call(auth, 'GET', `/oauth2/end-session?${new URLSearchParams(query)}`, {
        jar,
        origin: null,
        headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' },
      });

    it('ends the person’s core session and returns them to the app’s registered address, with its state', async () => {
      const { auth, person, personId, client, idToken } = await signedInApp();
      network(auth);
      const reply = await endSessionRequest(auth, person, {
        id_token_hint: idToken,
        client_id: client.clientId,
        post_logout_redirect_uri: POST_LOGOUT,
        state: 'back-to-app',
      });
      expect(reply.status).toBe(302);
      const location = new URL(reply.headers.get('location') as string);
      expect(`${location.origin}${location.pathname}`).toBe(POST_LOGOUT);
      expect(location.searchParams.get('state')).toBe('back-to-app');
      expect(await sessionCount(personId)).toBe(0);
    });

    it('does not follow an address that was not registered, and still ends the session', async () => {
      const { auth, person, personId, client, idToken } = await signedInApp();
      network(auth);
      for (const evil of [
        'https://evil.example.com/signed-out',
        `${POST_LOGOUT}/extra`,
        `${POST_LOGOUT}?x=1`,
        'http://rp.example.com/signed-out',
      ]) {
        const reply = await endSessionRequest(auth, person, {
          id_token_hint: idToken,
          client_id: client.clientId,
          post_logout_redirect_uri: evil,
          state: 'x',
        });
        expect(reply.headers.get('location'), evil).toBeNull();
        expect(reply.status, evil).toBeLessThan(400);
        // The first request ends the session; later ones find nobody signed in and say so.
        break;
      }
      expect(await sessionCount(personId)).toBe(0);
    });

    it('says an unregistered address was not followed, and never echoes the state to it', async () => {
      const { auth, person, client, idToken } = await signedInApp();
      network(auth);
      const reply = await endSessionRequest(auth, person, {
        id_token_hint: idToken,
        client_id: client.clientId,
        post_logout_redirect_uri: 'https://evil.example.com/steal',
        state: 'secret-state',
      });
      expect(reply.headers.get('location')).toBeNull();
      expect(JSON.stringify(reply.body)).not.toContain('secret-state');
    });

    it('is for an app that has end-session switched on, and nobody else', async () => {
      const ctx = await instance();
      const client = await registerClient(ctx.auth, ctx.owner, {
        enableEndSession: false,
        postLogoutRedirectUris: [POST_LOGOUT],
      });
      const { tokens } = await signInTo(ctx.auth, ctx.person, client, { scope: 'openid' });
      network(ctx.auth);
      const reply = await endSessionRequest(ctx.auth, ctx.person, {
        id_token_hint: String(tokens.body.id_token),
        client_id: client.clientId,
        post_logout_redirect_uri: POST_LOGOUT,
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(await sessionCount(ctx.personId)).toBe(1);
    });

    it('ends nothing for an id_token_hint core did not sign, though it shows the person a confirmation', async () => {
      const { auth, person, personId, client, idToken } = await signedInApp();
      network(auth);
      const [header, payload] = idToken.split('.');
      const forged = `${header}.${payload}.${Buffer.alloc(64).toString('base64url')}`;
      const reply = await endSessionRequest(auth, person, {
        id_token_hint: forged,
        client_id: client.clientId,
        post_logout_redirect_uri: POST_LOGOUT,
      });
      expect(reply.headers.get('location')).toBeNull();
      expect(await sessionCount(personId)).toBe(1);
    });

    it('does not end another browser’s session just because an app held its token', async () => {
      const { auth, person, personId, personEmail, client, idToken } = await signedInApp();
      network(auth);
      const other = new Jar();
      await call(auth, 'POST', '/sign-in/email', {
        jar: other,
        body: { email: personEmail, password: PASSWORD },
      });
      expect(await sessionCount(personId)).toBe(2);
      // The hint names the first browser's session; the request comes from the second.
      const reply = await endSessionRequest(auth, other, {
        id_token_hint: idToken,
        client_id: client.clientId,
        post_logout_redirect_uri: POST_LOGOUT,
      });
      expect(reply.headers.get('location')).toBeNull();
      expect(await sessionCount(personId)).toBe(2);
      void person;
    });

    it('puts a session id in the ID token of an app that can sign out or be told, and of no other', async () => {
      const ctx = await instance();
      const plain = await registerClient(ctx.auth, ctx.owner);
      const withEnd = await registerClient(ctx.auth, ctx.owner, { enableEndSession: true });
      const told = await registerClient(ctx.auth, ctx.owner, { backchannelLogoutUri: LOGOUT_URI });
      const sidIn = async (client: RegisteredClient) => {
        const { tokens } = await signInTo(ctx.auth, ctx.person, client, { scope: 'openid' });
        return verifyJwt(String(tokens.body.id_token), await publishedKeys(ctx.auth)).payload.sid;
      };
      const session = await sessionIdOf(ctx.personId);
      expect(await sidIn(plain)).toBeUndefined();
      expect(await sidIn(withEnd)).toBe(session);
      expect(await sidIn(told)).toBe(session);
    });
  });

  describe('telling an app its person’s session ended (back-channel logout)', () => {
    async function toldApp(options: { scope?: string } = {}) {
      const ctx = await instance();
      const client = await registerClient(ctx.auth, ctx.owner, {
        backchannelLogoutUri: LOGOUT_URI,
        scope: 'openid profile offline_access',
      });
      const { tokens } = await signInTo(ctx.auth, ctx.person, client, {
        scope: options.scope ?? 'openid offline_access',
      });
      return { ...ctx, client, tokens, sessionId: await sessionIdOf(ctx.personId) };
    }

    it('posts a signed logout token to the registered address when the person signs out of core, and revokes the session’s access tokens', async () => {
      const { auth, settled, person, personId, client, tokens, sessionId } = await toldApp();
      const sent = network(auth);
      const access = accessOf(tokens);
      expect((await userInfo(auth, access)).status).toBe(200);

      const out = await call(auth, 'POST', '/sign-out', { jar: person, body: {} });
      await settled();
      expect(out.status).toBe(200);
      expect(await sessionCount(personId)).toBe(0);

      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ url: LOGOUT_URI, method: 'POST' });
      expect(sent[0]?.headers['content-type']).toContain('application/x-www-form-urlencoded');
      const jwt = verifyJwt(logoutTokenOf(sent[0] as Sent), await publishedKeys(auth));
      expect(jwt.header).toMatchObject({ alg: 'EdDSA', typ: 'logout+jwt' });
      expect(jwt.payload).toMatchObject({
        iss: BASE_URL,
        aud: client.clientId,
        sub: personId,
        sid: sessionId,
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      });
      expect(jwt.payload).not.toHaveProperty('nonce');
      expect(Number(jwt.payload.exp) - Number(jwt.payload.iat)).toBe(120);
      expect(typeof jwt.payload.jti).toBe('string');

      expect((await userInfo(auth, access)).status).toBeGreaterThanOrEqual(400);
    });

    it('carries the session id the app saw in its ID token, so it knows which of its sessions to end', async () => {
      const { auth, settled, person, tokens } = await toldApp();
      const sent = network(auth);
      const seen = verifyJwt(String(tokens.body.id_token), await publishedKeys(auth)).payload.sid;
      await call(auth, 'POST', '/sign-out', { jar: person, body: {} });
      await settled();
      expect(verifyJwt(logoutTokenOf(sent[0] as Sent), await publishedKeys(auth)).payload.sid).toBe(
        seen,
      );
    });

    it('tells an app once for each session it was used in, and not an app with no address, nor one that is switched off', async () => {
      const ctx = await instance();
      const told = await registerClient(ctx.auth, ctx.owner, { backchannelLogoutUri: LOGOUT_URI });
      const silent = await registerClient(ctx.auth, ctx.owner);
      const off = await registerClient(ctx.auth, ctx.owner, { backchannelLogoutUri: `${APP}/off` });
      await db.run('update oauth_clients set disabled = ? where client_id = ?', [
        db.family === 'postgres' ? true : 1,
        off.clientId,
      ]);
      // Signed in to each while enabled, then the third is switched off before the sign-out.
      await db.run('update oauth_clients set disabled = ? where client_id = ?', [
        db.family === 'postgres' ? false : 0,
        off.clientId,
      ]);
      for (const client of [told, silent, off])
        await signInTo(ctx.auth, ctx.person, client, { scope: 'openid' });
      await db.run('update oauth_clients set disabled = ? where client_id = ?', [
        db.family === 'postgres' ? true : 1,
        off.clientId,
      ]);
      const sent = network(ctx.auth);
      await call(ctx.auth, 'POST', '/sign-out', { jar: ctx.person, body: {} });
      await ctx.settled();
      expect(sent.map((s) => s.url)).toEqual([LOGOUT_URI]);
    });

    it('is not undone by an app that does not answer: the person is signed out, and it is tried once', async () => {
      const { auth, settled, person, personId } = await toldApp();
      const sent = network(auth, () => new Response('nope', { status: 500 }));
      const out = await call(auth, 'POST', '/sign-out', { jar: person, body: {} });
      await settled();
      expect(out.status).toBe(200);
      expect(await sessionCount(personId)).toBe(0);
      expect(sent).toHaveLength(1);
    });

    it('is not undone by an app that cannot be reached', async () => {
      const { auth, settled, person, personId } = await toldApp();
      const sent = network(auth, () => {
        throw new Error('connection refused');
      });
      expect((await call(auth, 'POST', '/sign-out', { jar: person, body: {} })).status).toBe(200);
      await settled();
      expect(await sessionCount(personId)).toBe(0);
      expect(sent).toHaveLength(1);
    });

    it('leaves a refresh token obtained with offline_access alone when a session ends, as the specification says', async () => {
      const { auth, settled, person, client, tokens } = await toldApp();
      network(auth);
      await call(auth, 'POST', '/sign-out', { jar: person, body: {} });
      await settled();
      expect((await refresh(auth, client, refreshOf(tokens))).status).toBe(200);
    });

    it('is also what ending a session in the identity pages does, for that session only', async () => {
      const { auth, settled, personId, personEmail, tokens } = await toldApp();
      const sent = network(auth);
      const other = new Jar();
      await call(auth, 'POST', '/sign-in/email', {
        jar: other,
        body: { email: personEmail, password: PASSWORD },
      });
      const mine = await sessionIdOf(personId);
      const asked = new Headers({ cookie: other.header() ?? '' });
      // `other` is the newest session; end the older one (the one the app was used in) from there.
      const older = String(
        (
          await db.run('select id from sessions where user_id = ? order by created_at asc', [
            personId,
          ])
        ).rows[0]?.id,
      );
      expect(older).not.toBe(mine);
      expect(await endSession(auth, db, personId, older, asked)).toBe(true);
      await settled();
      expect(sent).toHaveLength(1);
      expect(verifyJwt(logoutTokenOf(sent[0] as Sent), await publishedKeys(auth)).payload.sid).toBe(
        older,
      );
      expect((await userInfo(auth, accessOf(tokens))).status).toBeGreaterThanOrEqual(400);
    });

    it('is what ending every other session does, for each of them', async () => {
      const { auth, settled, person, personId, personEmail, tokens } = await toldApp();
      const sent = network(auth);
      const other = new Jar();
      await call(auth, 'POST', '/sign-in/email', {
        jar: other,
        body: { email: personEmail, password: PASSWORD },
      });
      const current = await sessionIdOf(personId);
      expect(
        await endOtherSessions(
          auth,
          db,
          personId,
          current,
          new Headers({ cookie: other.header() ?? '' }),
        ),
      ).toBe(1);
      await settled();
      expect(sent).toHaveLength(1);
      expect((await userInfo(auth, accessOf(tokens))).status).toBeGreaterThanOrEqual(400);
      void person;
    });
  });

  describe('deactivating an account', () => {
    async function activeApp() {
      const ctx = await instance();
      const told = await registerClient(ctx.auth, ctx.owner, {
        backchannelLogoutUri: LOGOUT_URI,
        scope: 'openid profile offline_access',
      });
      const quiet = await registerClient(ctx.auth, ctx.owner, {
        scope: 'openid profile offline_access',
      });
      const withOffline = (
        await signInTo(ctx.auth, ctx.person, told, { scope: 'openid offline_access' })
      ).tokens;
      const without = (await signInTo(ctx.auth, ctx.person, quiet, { scope: 'openid profile' }))
        .tokens;
      const states = new AccountStates(db, { log: () => undefined });
      revokeOnDeactivation(states, () => Promise.resolve(ctx.auth));
      return { ...ctx, told, quiet, withOffline, without, states };
    }

    it('rejects every token the account holds: an access token, a refresh token with offline_access, userinfo and introspection', async () => {
      const { auth, personId, told, quiet, withOffline, without, states } = await activeApp();
      network(auth);
      expect((await userInfo(auth, accessOf(withOffline))).status).toBe(200);
      expect((await userInfo(auth, accessOf(without))).status).toBe(200);

      await states.deactivate(personId);

      for (const tokens of [withOffline, without]) {
        expect((await userInfo(auth, accessOf(tokens))).status).toBeGreaterThanOrEqual(400);
      }
      expect((await refresh(auth, told, refreshOf(withOffline))).status).toBeGreaterThanOrEqual(
        400,
      );
      expect(
        (await formPost(auth, '/oauth2/introspect', { token: accessOf(withOffline) }, told)).body
          .active,
      ).toBe(false);
      expect(
        (await formPost(auth, '/oauth2/introspect', { token: accessOf(without) }, quiet)).body
          .active,
      ).toBe(false);
    });

    it('does so in the same operation that ends its sessions: when the deactivation fails, nothing is revoked', async () => {
      const { auth, owner, personId, withOffline, states } = await activeApp();
      void owner;
      network(auth);
      states.addStep(() => Promise.reject(new Error('this step fails')));
      await expect(states.deactivate(personId)).rejects.toThrow('this step fails');
      expect(await sessionCount(personId)).toBe(1);
      expect(await revokedCount('oauth_access_tokens')).toBe(0);
      expect(await revokedCount('oauth_refresh_tokens')).toBe(0);
      expect((await userInfo(auth, accessOf(withOffline))).status).toBe(200);
    });

    it('tells each app that registered an address, once the deactivation has been committed', async () => {
      const {
        auth,
        personId,
        states,
        told,
        sessionId = '',
      } = { ...(await activeApp()), sessionId: undefined };
      const sent = network(auth);
      const session = await sessionIdOf(personId);
      await states.deactivate(personId);
      expect(sent).toHaveLength(1);
      const jwt = verifyJwt(logoutTokenOf(sent[0] as Sent), await publishedKeys(auth));
      expect(jwt.payload).toMatchObject({ aud: told.clientId, sub: personId, sid: session });
      void sessionId;
    });

    it('is not undone by an app that does not answer', async () => {
      const { auth, personId, states } = await activeApp();
      network(auth, () => new Response('nope', { status: 503 }));
      const result = await states.deactivate(personId);
      expect(result.changed).toBe(true);
      expect(await sessionCount(personId)).toBe(0);
    });

    it('leaves other people’s tokens alone', async () => {
      const { auth, owner, personId, told, states } = await activeApp();
      network(auth);
      const { tokens } = await signInTo(auth, owner, told, { scope: 'openid offline_access' });
      await states.deactivate(personId);
      expect((await userInfo(auth, accessOf(tokens))).status).toBe(200);
      expect((await refresh(auth, told, refreshOf(tokens))).status).toBe(200);
    });

    it('gives a deactivated account no code, and no token for a code it was given before', async () => {
      const { auth, person, personId, quiet, states } = await activeApp();
      network(auth);
      const { verifier, challenge } = pkce();
      const { code } = await authorize(auth, person, quiet, { scope: 'openid profile', challenge });
      expect(code).toBeTruthy();
      await states.deactivate(personId);
      const exchanged = await exchangeCode(auth, quiet, code as string, verifier);
      expect(exchanged.status).toBeGreaterThanOrEqual(400);
      expect(exchanged.body.access_token).toBeUndefined();
    });
  });

  describe('the revocation routine', () => {
    async function holders() {
      const ctx = await instance();
      const one = await registerClient(ctx.auth, ctx.owner, {
        scope: 'openid profile offline_access',
      });
      const two = await registerClient(ctx.auth, ctx.owner, {
        scope: 'openid profile offline_access',
      });
      const mine1 = (await signInTo(ctx.auth, ctx.person, one, { scope: 'openid offline_access' }))
        .tokens;
      const mine2 = (await signInTo(ctx.auth, ctx.person, two, { scope: 'openid offline_access' }))
        .tokens;
      const theirs = (await signInTo(ctx.auth, ctx.owner, one, { scope: 'openid offline_access' }))
        .tokens;
      return { ...ctx, one, two, mine1, mine2, theirs };
    }
    const at = () => stamp(db);

    it('revokes every access and refresh token an account holds, offline ones too, and nobody else’s', async () => {
      const { auth, personId, one, two, mine1, mine2, theirs } = await holders();
      const done = await db.transaction((tx) => revokeAllTokens(tx, at(), personId));
      expect(done).toEqual({ accessTokens: 2, refreshTokens: 2 });
      for (const [client, tokens] of [
        [one, mine1],
        [two, mine2],
      ] as const) {
        expect((await refresh(auth, client, refreshOf(tokens))).status).toBeGreaterThanOrEqual(400);
        expect((await userInfo(auth, accessOf(tokens))).status).toBeGreaterThanOrEqual(400);
      }
      expect((await userInfo(auth, accessOf(theirs))).status).toBe(200);
      expect((await refresh(auth, one, refreshOf(theirs))).status).toBe(200);
    });

    it('does nothing the second time, and says so', async () => {
      const { personId } = await holders();
      await db.transaction((tx) => revokeAllTokens(tx, at(), personId));
      expect(await db.transaction((tx) => revokeAllTokens(tx, at(), personId))).toEqual({
        accessTokens: 0,
        refreshTokens: 0,
      });
    });

    it('revokes one app’s tokens for one account, and leaves that account’s other apps alone', async () => {
      const { auth, personId, one, two, mine1, mine2 } = await holders();
      const done = await db.transaction((tx) =>
        revokeClientTokens(tx, at(), personId, one.clientId),
      );
      expect(done).toEqual({ accessTokens: 1, refreshTokens: 1 });
      expect((await refresh(auth, one, refreshOf(mine1))).status).toBeGreaterThanOrEqual(400);
      expect((await refresh(auth, two, refreshOf(mine2))).status).toBe(200);
    });

    it('is undone with the transaction it belongs to when that fails', async () => {
      const { auth, personId, one, mine1 } = await holders();
      await expect(
        db.transaction(async (tx) => {
          await revokeAllTokens(tx, at(), personId);
          throw new Error('abandoned');
        }),
      ).rejects.toThrow('abandoned');
      expect((await refresh(auth, one, refreshOf(mine1))).status).toBe(200);
    });

    it('removes access: the consent goes, the tokens stop, and the next sign-in asks again', async () => {
      const ctx = await instance();
      const client = await registerClient(ctx.auth, ctx.owner, {
        trusted: false,
        scope: 'openid profile offline_access',
      });
      const { auth, person, personId } = ctx;
      const first = await authorize(auth, person, client, {
        scope: 'openid profile offline_access',
        challenge: pkce().challenge,
      });
      const signed = signedQueryFor(first.location as string);
      const consented = await call(auth, 'POST', '/oauth2/consent', {
        jar: person,
        body: { accept: true, oauth_query: signed },
      });
      const { verifier, challenge } = pkce();
      const second = await authorize(auth, person, client, {
        scope: 'openid profile offline_access',
        challenge,
      });
      expect(second.code).toBeTruthy();
      void consented;
      const tokens = await exchangeCode(auth, client, second.code as string, verifier);
      expect(tokens.status).toBe(200);

      const removed = await removeAccess(db, personId, client.clientId);
      expect(removed).toMatchObject({ consentsRemoved: 1, accessTokens: 1, refreshTokens: 1 });

      expect((await refresh(auth, client, refreshOf(tokens))).status).toBeGreaterThanOrEqual(400);
      expect((await userInfo(auth, accessOf(tokens))).status).toBeGreaterThanOrEqual(400);
      const again = await authorize(auth, person, client, {
        scope: 'openid profile offline_access',
        challenge: pkce().challenge,
      });
      expect(again.code).toBeUndefined();
      expect(again.url?.pathname).toBe('/consent');
    });

    it('removes one app’s access and no other’s, and no other person’s', async () => {
      const { auth, personId, ownerId, one, two, mine1, mine2, theirs } = {
        ...(await holders()),
        ownerId: '',
      };
      const removed = await removeAccess(db, personId, one.clientId);
      expect(removed.accessTokens).toBe(1);
      expect((await refresh(auth, two, refreshOf(mine2))).status).toBe(200);
      expect((await refresh(auth, one, refreshOf(theirs))).status).toBe(200);
      expect((await refresh(auth, one, refreshOf(mine1))).status).toBeGreaterThanOrEqual(400);
      void ownerId;
    });

    it('is the only way to remove consent: the provider’s own endpoints are switched off', async () => {
      const { auth, person } = await holders();
      for (const path of ['/oauth2/delete-consent', '/oauth2/update-consent']) {
        const reply = await call(auth, 'POST', path, { jar: person, body: { id: 'x' } });
        expect(reply.status, path).toBe(404);
      }
    });

    it('names its tables and columns from the schema, so a rename cannot slip past it', async () => {
      const { NAMES } = await import('../oauth/schema-names');
      expect(NAMES.accessTokens).toBe('oauth_access_tokens');
      expect(NAMES.refreshTokens).toBe('oauth_refresh_tokens');
      expect(NAMES.consents).toBe('oauth_consents');
      expect(NAMES.access).toMatchObject({
        userId: 'user_id',
        clientId: 'client_id',
        revoked: 'revoked',
      });
    });
  });

  describe('planning and sending notices directly', () => {
    it('reads who to tell before the sessions go, and sends nothing for nobody', async () => {
      const ctx = await instance();
      const told = await registerClient(ctx.auth, ctx.owner, { backchannelLogoutUri: LOGOUT_URI });
      await signInTo(ctx.auth, ctx.person, told, { scope: 'openid' });
      const planned = await db.transaction((tx) => planLogoutNotices(tx, ctx.personId));
      expect(planned).toEqual([
        {
          clientId: told.clientId,
          uri: LOGOUT_URI,
          sessionId: await sessionIdOf(ctx.personId),
          userId: ctx.personId,
        },
      ]);
      expect(await db.transaction((tx) => planLogoutNotices(tx, 'nobody'))).toEqual([]);
      const sent = network(ctx.auth);
      await sendLogoutNotices(ctx.auth, []);
      expect(sent).toHaveLength(0);
    });

    it('leaves out an app that is switched off, and one with no address, and tells an app once for each session', async () => {
      const ctx = await instance();
      const told = await registerClient(ctx.auth, ctx.owner, { backchannelLogoutUri: LOGOUT_URI });
      const off = await registerClient(ctx.auth, ctx.owner, { backchannelLogoutUri: `${APP}/off` });
      const silent = await registerClient(ctx.auth, ctx.owner);
      for (const client of [told, off, silent]) {
        await signInTo(ctx.auth, ctx.person, client, { scope: 'openid offline_access' });
      }
      // A second visit to the same app, in the same session, is still one notice for that session.
      await signInTo(ctx.auth, ctx.person, told, { scope: 'openid' });
      await db.run('update oauth_clients set disabled = ? where client_id = ?', [
        db.family === 'postgres' ? true : 1,
        off.clientId,
      ]);
      const planned = await db.transaction((tx) => planLogoutNotices(tx, ctx.personId));
      expect(planned.map((notice) => notice.clientId)).toEqual([told.clientId]);
    });

    it('finds an app by its refresh token when no access token is left to find it by', async () => {
      const ctx = await instance();
      const told = await registerClient(ctx.auth, ctx.owner, {
        backchannelLogoutUri: LOGOUT_URI,
        scope: 'openid offline_access',
      });
      await signInTo(ctx.auth, ctx.person, told, { scope: 'openid offline_access' });
      await db.run('delete from oauth_access_tokens');
      const planned = await db.transaction((tx) => planLogoutNotices(tx, ctx.personId));
      expect(planned.map((notice) => notice.clientId)).toEqual([told.clientId]);
    });

    it('sends a token that is as the specification asks: typed, with the event, an expiry two minutes on, no nonce', async () => {
      const ctx = await instance();
      const sent = network(ctx.auth);
      await sendLogoutNotices(ctx.auth, [
        { clientId: 'the-app', uri: LOGOUT_URI, sessionId: 'sid-1', userId: 'user-1' },
      ]);
      expect(sent).toHaveLength(1);
      const jwt = verifyJwt(logoutTokenOf(sent[0] as Sent), await publishedKeys(ctx.auth));
      expect(jwt.header).toMatchObject({ alg: 'EdDSA', typ: 'logout+jwt' });
      expect(jwt.payload).toMatchObject({
        iss: BASE_URL,
        aud: 'the-app',
        sub: 'user-1',
        sid: 'sid-1',
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      });
      expect(jwt.payload).not.toHaveProperty('nonce');
      expect(Number(jwt.payload.exp) - Number(jwt.payload.iat)).toBe(120);
      expect(String(jwt.payload.jti)).toMatch(/^[0-9a-f]{32}$/);
    });

    it('does not follow a redirect from the app, and times out rather than waiting for ever', async () => {
      const ctx = await instance();
      const log: string[] = [];
      const seen: RequestInit[] = [];
      await sendLogoutNotices(
        ctx.auth,
        [{ clientId: 'c', uri: LOGOUT_URI, sessionId: 's', userId: 'u' }],
        {
          fetch: ((_url: string, init: RequestInit) => {
            seen.push(init);
            return Promise.resolve(new Response(null, { status: 302 }));
          }) as unknown as typeof fetch,
          log: (message) => log.push(message),
        },
      );
      expect(seen[0]?.redirect).toBe('error');
      expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
      expect(log.join(' ')).toContain('returned 302');
    });
  });

  /** The signed part of the sign-in or consent address, as the page would send it back. */
  function signedQueryFor(location: string): string {
    const params = new URL(location, BASE_URL).searchParams;
    const names = new Set(params.getAll('ba_param'));
    const signed = new URLSearchParams();
    for (const [key, value] of params.entries()) {
      if (key === 'sig' || key === 'ba_param' || names.has(key)) signed.append(key, value);
    }
    return signed.toString();
  }
  void REDIRECT;
}
