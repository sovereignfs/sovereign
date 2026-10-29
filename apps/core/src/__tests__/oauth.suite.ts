/**
 * Core as an OpenID Connect provider (core-app §3.6.1, §3.6.2) against a real database: the flows it
 * offers and the ones it refuses, the claims each scope allows, token lifetimes, refresh rotation and
 * reuse detection, the keys and who may register a client. Each behaviour research 0001 checked is a test
 * here, driven through better-auth's own request handler the way a relying party's requests arrive. One
 * suite, run by `oauth.test.ts` on a SQLite file and by `oauth.db.test.ts` on whichever dialect the CI leg
 * started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from '@better-auth/oauth-provider';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountStates } from '../accounts/states';
import type { Auth } from '../auth/auth';
import { ROLE_ADMIN, ROLE_OWNER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import {
  ACCESS_TOKEN_SECONDS,
  ID_TOKEN_SECONDS,
  KEY_GRACE_SECONDS,
  KEY_ROTATION_SECONDS,
  REFRESH_TOKEN_SECONDS,
} from '../oauth/provider';
import { changeCapabilities } from '../roles/configure';
import { changeRole } from '../roles/people';
import { secretOf, totp } from './totp';
import { BASE_URL, Jar, PASSWORD, call, makeAuth, signUp } from './auth-harness';
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

export function oauthSuite(createDatabase: () => Promise<TestDatabase>): void {
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

  const reset = async () => {
    for (const table of TABLES) await db.run(`delete from ${table}`);
  };
  beforeEach(reset);

  /** An instance with its owner signed in, and one ordinary person. */
  async function instance() {
    const auth = makeAuth(db);
    const owner = await signUp(auth);
    const person = await signUp(auth);
    const idOf = async (email: string) =>
      String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
    return {
      auth,
      owner: owner.jar,
      person: person.jar,
      ownerId: await idOf(owner.email),
      personId: await idOf(person.email),
    };
  }

  async function code(auth: Auth, jar: Jar, client: RegisteredClient, scope: string) {
    const flow = await signInTo(auth, jar, client, { scope });
    return flow.tokens.body as Record<string, string>;
  }

  describe('discovery', () => {
    it('names the instance URL as the issuer, with the endpoints under /api/auth', async () => {
      const { auth } = await instance();
      const config = (await auth.api.getOpenIdConfig()) as Record<string, unknown>;
      expect(config.issuer).toBe(BASE_URL);
      for (const endpoint of [
        'authorization_endpoint',
        'token_endpoint',
        'userinfo_endpoint',
        'jwks_uri',
        'end_session_endpoint',
      ]) {
        expect(config[endpoint], endpoint).toMatch(new RegExp(`^${BASE_URL}/api/auth/`));
      }
    });

    it('offers the authorization code flow and refresh tokens, and nothing else, with S256 only', async () => {
      const { auth } = await instance();
      const config = (await auth.api.getOpenIdConfig()) as Record<string, unknown>;
      expect(config.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
      expect(config.response_types_supported).toEqual(['code']);
      expect(config.code_challenge_methods_supported).toEqual(['S256']);
      expect(config.id_token_signing_alg_values_supported).toEqual(['EdDSA']);
    });

    it('lists the scopes and the claims core can give', async () => {
      const { auth } = await instance();
      const config = (await auth.api.getOpenIdConfig()) as unknown as Record<string, string[]>;
      expect(config.scopes_supported).toEqual([
        'openid',
        'profile',
        'email',
        'roles',
        'directory',
        'offline_access',
      ]);
      for (const claim of [
        'name',
        'picture',
        'email',
        'email_verified',
        'locale',
        'zoneinfo',
        'roles',
      ]) {
        expect(config.claims_supported, claim).toContain(claim);
      }
    });

    it('is the same document at the OAuth address, and served at the root by the route helpers', async () => {
      const { auth } = await instance();
      const oidc = await oauthProviderOpenIdConfigMetadata(auth)(
        new Request(`${BASE_URL}/.well-known/openid-configuration`),
      );
      const oauth = await oauthProviderAuthServerMetadata(auth)(
        new Request(`${BASE_URL}/.well-known/oauth-authorization-server`),
      );
      expect(oidc.status).toBe(200);
      expect(oauth.status).toBe(200);
      expect(((await oidc.json()) as { issuer: string }).issuer).toBe(BASE_URL);
      expect(((await oauth.json()) as { issuer: string }).issuer).toBe(BASE_URL);
    });
  });

  describe('signing in to a client', () => {
    it('gives tokens for a registered client that asks with PKCE, and the ID token verifies against the published keys', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { authorized, tokens } = await signInTo(auth, owner, client, {
        scope: 'openid profile email',
        nonce: 'abc',
      });
      expect(authorized.url?.href.startsWith(`${REDIRECT}?`)).toBe(true);
      expect(authorized.url?.searchParams.get('state')).toBe('state-1');
      expect(tokens.status).toBe(200);
      const body = tokens.body as Record<string, string | number>;
      expect(body.token_type).toBe('Bearer');

      const jwt = verifyJwt(String(body.id_token), await publishedKeys(auth));
      expect(jwt.header.alg).toBe('EdDSA');
      expect(jwt.payload).toMatchObject({ iss: BASE_URL, aud: client.clientId, nonce: 'abc' });
    });

    it('agrees on one issuer: discovery, every ID token, and the authorization response', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { authorized, tokens } = await signInTo(auth, owner, client, { scope: 'openid' });
      const config = (await auth.api.getOpenIdConfig()) as { issuer: string };
      const jwt = verifyJwt(
        String((tokens.body as { id_token: string }).id_token),
        await publishedKeys(auth),
      );
      expect(jwt.payload.iss).toBe(config.issuer);
      expect(authorized.url?.searchParams.get('iss')).toBe(config.issuer);
    });

    it('publishes Ed25519 keys', async () => {
      const { auth, owner } = await instance();
      await signInTo(auth, owner, await registerClient(auth, owner), { scope: 'openid' });
      const keys = await publishedKeys(auth);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys)
        expect(key).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA' });
    });

    it('lets a public client, which has no secret, sign in with PKCE', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner, { authMethod: 'none' });
      expect(client.secret).toBeUndefined();
      const { tokens } = await signInTo(auth, owner, client, { scope: 'openid' });
      expect(tokens.status).toBe(200);
    });

    it('uses an authorization code once', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { verifier, challenge } = pkce();
      const { code: first } = await authorize(auth, owner, client, { challenge });
      expect((await exchangeCode(auth, client, first as string, verifier)).status).toBe(200);
      const again = await exchangeCode(auth, client, first as string, verifier);
      expect(again.status).toBeGreaterThanOrEqual(400);
      expect(again.body.error).toBe('invalid_grant');
    });

    it('refuses a code exchanged with another client’s credentials, or the wrong redirect address', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const other = await registerClient(auth, owner);
      const { verifier, challenge } = pkce();
      const { code: issued } = await authorize(auth, owner, client, { challenge });
      expect(
        (await exchangeCode(auth, other, issued as string, verifier)).status,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (await exchangeCode(auth, client, issued as string, verifier, `${REDIRECT}/other`)).status,
      ).toBeGreaterThanOrEqual(400);
    });

    it('refuses a client that gives the wrong secret', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { verifier, challenge } = pkce();
      const { code: issued } = await authorize(auth, owner, client, { challenge });
      const wrong = { ...client, secret: 'not-the-secret' };
      const reply = await exchangeCode(auth, wrong, issued as string, verifier);
      expect(reply.status).toBe(401);
      expect(reply.body.error).toBe('invalid_client');
    });

    it('sends someone who is not signed in to the sign-in page, with the request kept in the address', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { reply, location } = await authorize(auth, new Jar(), client, {
        challenge: pkce().challenge,
      });
      expect(reply.status).toBe(302);
      const url = new URL(location as string, BASE_URL);
      expect(url.pathname).toBe('/sign-in');
      expect(url.searchParams.get('client_id')).toBe(client.clientId);
      expect(url.searchParams.get('sig')).toBeTruthy();
    });
  });

  describe('signing in on the page an app sent the person to', () => {
    /** What core's sign-in page sends along, as the provider's client plugin builds it from the address. */
    const signedQuery = (location: string) => {
      const params = new URL(location, BASE_URL).searchParams;
      const names = new Set(params.getAll('ba_param'));
      const signed = new URLSearchParams();
      for (const [key, value] of params.entries()) {
        if (key === 'sig' || key === 'ba_param' || names.has(key)) signed.append(key, value);
      }
      return signed.toString();
    };

    /** The app asks, with nobody signed in: core sends the browser to its sign-in page with the request. */
    async function asked(auth: Auth, client: RegisteredClient) {
      const { verifier, challenge } = pkce();
      const { location } = await authorize(auth, new Jar(), client, {
        scope: 'openid profile',
        challenge,
      });
      return { verifier, query: signedQuery(location as string) };
    }

    it('carries on with the app’s request after the password, and sends the browser back to the app with a code', async () => {
      const { auth, owner, person } = await instance();
      const client = await registerClient(auth, owner);
      const { verifier, query } = await asked(auth, client);
      const jar = new Jar();
      const email = String(
        (
          await db.run('select email from users where id = ?', [
            (await db.run("select id from users where role = 'platform:user'")).rows[0]?.id,
          ])
        ).rows[0]?.email,
      );
      void person;
      const reply = await call(auth, 'POST', '/sign-in/email', {
        jar,
        body: { email, password: PASSWORD, oauth_query: query },
      });
      expect(reply.status).toBe(200);
      expect(reply.body.redirect).toBe(true);
      const url = new URL(String(reply.body.url));
      expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
      expect(url.searchParams.get('state')).toBe('state-1');
      const issued = url.searchParams.get('code');
      expect(issued).toBeTruthy();

      const tokens = await exchangeCode(auth, client, issued as string, verifier);
      expect(tokens.status).toBe(200);
      const claims = verifyJwt(String(tokens.body.id_token), await publishedKeys(auth)).payload;
      expect(claims.name).toBe('Ada Lovelace');
    });

    it('carries on after the second step too, and not after the password alone', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      // The ordinary person turns on the authenticator app, which needs a verified address.
      const other = await signUp(auth);
      await db.run('update users set email_verified = ? where email = ?', [
        db.family === 'postgres' ? true : 1,
        other.email,
      ]);
      const enabled = await call(auth, 'POST', '/two-factor/enable', {
        jar: other.jar,
        body: { password: PASSWORD },
      });
      const secret = secretOf(String(enabled.body.totpURI));
      await call(auth, 'POST', '/two-factor/verify-totp', {
        jar: other.jar,
        body: { code: totp(secret) },
      });

      const { verifier, query } = await asked(auth, client);
      const jar = new Jar();
      const first = await call(auth, 'POST', '/sign-in/email', {
        jar,
        body: { email: other.email, password: PASSWORD, oauth_query: query },
      });
      expect(first.body.twoFactorRedirect).toBe(true);
      expect(first.body.redirect).not.toBe(true);

      const second = await call(auth, 'POST', '/two-factor/verify-totp', {
        jar,
        body: { code: totp(secret, Date.now() + 30_000), oauth_query: query },
      });
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      expect(second.body.redirect).toBe(true);
      const issued = new URL(String(second.body.url)).searchParams.get('code');
      expect((await exchangeCode(auth, client, issued as string, verifier)).status).toBe(200);
    });

    it.each([
      [
        'the redirect address',
        (q: URLSearchParams) => q.set('redirect_uri', 'https://evil.example.com/cb'),
      ],
      ['the client', (q: URLSearchParams) => q.set('client_id', 'someone-else')],
      ['the scopes', (q: URLSearchParams) => q.set('scope', 'openid roles')],
      ['the signature', (q: URLSearchParams) => q.set('sig', 'AAAA')],
    ])(
      'refuses a request whose %s was changed after core signed it, and signs nobody in',
      async (_name, tamper) => {
        const { auth, owner } = await instance();
        const client = await registerClient(auth, owner);
        const { query } = await asked(auth, client);
        const params = new URLSearchParams(query);
        tamper(params);
        const jar = new Jar();
        const email = String(
          (await db.run('select email from users order by created_at desc')).rows[0]?.email,
        );
        const reply = await call(auth, 'POST', '/sign-in/email', {
          jar,
          body: { email, password: PASSWORD, oauth_query: params.toString() },
        });
        expect(reply.status).toBeGreaterThanOrEqual(400);
        expect(reply.body.redirect).not.toBe(true);
        expect(reply.setCookies.join(';')).not.toContain('session_token');
      },
    );

    it('is not a way to sign in without the password', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { query } = await asked(auth, client);
      const reply = await call(auth, 'POST', '/sign-in/email', {
        jar: new Jar(),
        body: { email: 'nobody@example.com', password: 'wrong wrong wrong', oauth_query: query },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(reply.body.redirect).not.toBe(true);
    });
  });

  describe('what a client may not do', () => {
    it.each([
      ['no code_challenge, for a confidential client', 'client_secret_basic'],
      ['no code_challenge, for a public client', 'none'],
    ] as const)('authorizing with %s is refused', async (_name, authMethod) => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner, { authMethod });
      const { code: issued, error } = await authorize(auth, owner, client, { challenge: null });
      expect(issued).toBeUndefined();
      expect(error).toBeTruthy();
    });

    it('refuses the plain challenge method', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { code: issued, error } = await authorize(auth, owner, client, {
        method: 'plain',
        challenge: pkce().verifier,
      });
      expect(issued).toBeUndefined();
      expect(error).toBeTruthy();
    });

    it('refuses an exchange with the wrong code verifier', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { challenge } = pkce();
      const { code: issued } = await authorize(auth, owner, client, { challenge });
      const reply = await exchangeCode(auth, client, issued as string, pkce().verifier);
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(reply.body.error).toBe('invalid_grant');
    });

    it('refuses the implicit flow', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      for (const responseType of ['token', 'id_token', 'code token', 'id_token token']) {
        const { url, error, reply } = await authorize(auth, owner, client, {
          responseType,
          challenge: pkce().challenge,
        });
        expect(url?.searchParams.get('code'), responseType).toBeNull();
        expect(url?.searchParams.get('access_token'), responseType).toBeNull();
        expect(error || reply.status >= 400, responseType).toBeTruthy();
      }
    });

    it.each(['password', 'client_credentials', 'urn:ietf:params:oauth:grant-type:device_code'])(
      'refuses the %s grant',
      async (grantType) => {
        const { auth, owner } = await instance();
        const client = await registerClient(auth, owner);
        const reply = await formPost(
          auth,
          '/oauth2/token',
          { grant_type: grantType, username: 'a', password: 'b', scope: 'openid' },
          client,
        );
        expect(reply.status).toBeGreaterThanOrEqual(400);
        expect(reply.body.access_token).toBeUndefined();
      },
    );

    it('refuses a client registering itself', async () => {
      const { auth } = await instance();
      const reply = await call(auth, 'POST', '/oauth2/register', {
        body: { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' },
        origin: null,
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(reply.body.client_id).toBeUndefined();
      expect((await db.run('select count(*) as n from oauth_clients')).rows[0]?.n).toBe(0);
    });

    it('refuses a signed-in person registering one too, at the registration endpoint', async () => {
      const { auth, person } = await instance();
      const reply = await call(auth, 'POST', '/oauth2/register', {
        jar: person,
        body: { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(reply.body.client_id).toBeUndefined();
      expect((await db.run('select count(*) as n from oauth_clients')).rows[0]?.n).toBe(0);
    });

    it('does not hand a signed JWT to a session at the JWT plugin’s own /token', async () => {
      const { auth, owner } = await instance();
      const reply = await call(auth, 'GET', '/token', { jar: owner, origin: null });
      expect(reply.status).toBe(404);
    });
  });

  describe('redirect addresses', () => {
    it.each([
      ['a different path', `${REDIRECT}/x`],
      ['a different host', 'https://evil.example.com/cb'],
      ['a different scheme', 'http://rp.example.com/cb'],
      ['a trailing slash', `${REDIRECT}/`],
      ['an added query', `${REDIRECT}?a=1`],
      ['a different port', 'https://rp.example.com:8443/cb'],
    ])('are matched exactly: %s is refused and never followed', async (_name, redirectUri) => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { reply, location } = await authorize(auth, owner, client, {
        redirectUri,
        challenge: pkce().challenge,
      });
      expect(location?.startsWith(redirectUri.split('?')[0] as string) ?? false).toBe(false);
      expect(location?.includes('code=') ?? false).toBe(false);
      expect(
        reply.status === 302 ? new URL(location as string, BASE_URL).origin : BASE_URL,
      ).not.toBe(new URL(redirectUri).origin);
    });

    it('does not let a registered loopback address change its port', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner, {
        redirectUris: ['http://127.0.0.1:4000/cb'],
        applicationType: 'native',
      });
      const same = await authorize(auth, owner, client, {
        redirectUri: 'http://127.0.0.1:4000/cb',
        challenge: pkce().challenge,
      });
      expect(same.code).toBeTruthy();
      const { code: issued, url } = await authorize(auth, owner, client, {
        redirectUri: 'http://127.0.0.1:4999/cb',
        challenge: pkce().challenge,
      });
      expect(issued).toBeUndefined();
      // Nothing is sent to the address that was asked for: core says so on its own page.
      expect(url?.origin).toBe(BASE_URL);
    });

    it('accepts the registered address, and any one of several', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner, {
        redirectUris: [REDIRECT, 'https://rp.example.com/other'],
      });
      for (const redirectUri of [REDIRECT, 'https://rp.example.com/other']) {
        const { code: issued } = await authorize(auth, owner, client, {
          redirectUri,
          challenge: pkce().challenge,
        });
        expect(issued, redirectUri).toBeTruthy();
      }
    });
  });

  describe('a person whose session has ended', () => {
    it('is sent to sign in, not given a code, even though their browser still holds the cookie', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      expect(
        (await authorize(auth, owner, client, { challenge: pkce().challenge })).code,
      ).toBeTruthy();
      await db.run('delete from sessions');
      const {
        reply,
        code: issued,
        url,
      } = await authorize(auth, owner, client, {
        challenge: pkce().challenge,
      });
      expect(issued).toBeUndefined();
      expect(reply.status).toBe(302);
      expect(url?.pathname).toBe('/sign-in');
    });

    it('is given no code once the account is deactivated', async () => {
      const { auth, owner, person, personId } = await instance();
      const client = await registerClient(auth, owner);
      expect(
        (await authorize(auth, person, client, { challenge: pkce().challenge })).code,
      ).toBeTruthy();
      await new AccountStates(db, { log: () => undefined }).deactivate(personId);
      const { code: issued, url } = await authorize(auth, person, client, {
        challenge: pkce().challenge,
      });
      expect(issued).toBeUndefined();
      expect(url?.pathname).toBe('/sign-in');
    });
  });

  describe('scopes and claims', () => {
    const claimsOf = async (scope: string, client: { scope?: string } = {}) => {
      const { auth, owner, ownerId } = await instance();
      await db.run('update users set image = ?, locale = ?, timezone = ? where id = ?', [
        '/api/avatars/u1?v=abc',
        'en-GB',
        'Europe/London',
        ownerId,
      ]);
      const registered = await registerClient(auth, owner, client);
      const tokens = await code(auth, owner, registered, scope);
      const idToken = verifyJwt(String(tokens.id_token), await publishedKeys(auth)).payload;
      const info = (await userInfo(auth, String(tokens.access_token))).body;
      return { idToken, info, ownerId };
    };

    it('gives only the subject for openid alone, in both places', async () => {
      const { idToken, info, ownerId } = await claimsOf('openid');
      for (const claim of [
        'name',
        'picture',
        'email',
        'email_verified',
        'locale',
        'zoneinfo',
        'roles',
      ]) {
        expect(idToken[claim], `id token ${claim}`).toBeUndefined();
        expect(info[claim], `userinfo ${claim}`).toBeUndefined();
      }
      expect(idToken.sub).toBe(ownerId);
      expect(info.sub).toBe(ownerId);
    });

    it('gives the profile claims for profile, with the picture as an absolute address and the saved preferences', async () => {
      const { idToken, info } = await claimsOf('openid profile');
      for (const claims of [idToken, info]) {
        expect(claims).toMatchObject({
          name: 'Ada Lovelace',
          picture: `${BASE_URL}/api/avatars/u1?v=abc`,
          locale: 'en-GB',
          zoneinfo: 'Europe/London',
        });
        expect(claims.email).toBeUndefined();
        expect(claims.roles).toBeUndefined();
      }
    });

    it('leaves out a preference nobody saved, and an absent picture', async () => {
      const { auth, owner, ownerId } = await instance();
      await db.run('update users set image = null, locale = null, timezone = null where id = ?', [
        ownerId,
      ]);
      const tokens = await code(auth, owner, await registerClient(auth, owner), 'openid profile');
      const claims = verifyJwt(String(tokens.id_token), await publishedKeys(auth)).payload;
      expect(claims.name).toBe('Ada Lovelace');
      for (const claim of ['picture', 'locale', 'zoneinfo'])
        expect(claims, claim).not.toHaveProperty(claim);
    });

    it('gives the email claims for email, in both places', async () => {
      const { idToken, info } = await claimsOf('openid email');
      for (const claims of [idToken, info]) {
        expect(claims).toMatchObject({ email_verified: false });
        expect(String(claims.email)).toMatch(/@example\.com$/);
        expect(claims.name).toBeUndefined();
      }
    });

    it('gives the role for a granted roles scope only', async () => {
      const withRoles = await claimsOf('openid roles');
      expect(withRoles.idToken.roles).toEqual([ROLE_OWNER]);
      expect(withRoles.info.roles).toEqual([ROLE_OWNER]);
      await reset();
      const without = await claimsOf('openid profile email');
      expect(without.idToken.roles).toBeUndefined();
      expect(without.info.roles).toBeUndefined();
    });

    it('refuses a scope the client is not allowed, and sends no code', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner, { scope: 'openid profile' });
      for (const scope of [
        'openid roles',
        'openid email',
        'openid directory',
        'openid offline_access',
      ]) {
        const { code: issued, error } = await authorize(auth, owner, client, {
          scope,
          challenge: pkce().challenge,
        });
        expect(issued, scope).toBeUndefined();
        expect(error, scope).toBe('invalid_scope');
      }
    });

    it('refuses a scope core does not know', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { code: issued, error } = await authorize(auth, owner, client, {
        scope: 'openid admin',
        challenge: pkce().challenge,
      });
      expect(issued).toBeUndefined();
      expect(error).toBe('invalid_scope');
    });

    it('gives an ordinary person’s role as it is, and never the owner’s', async () => {
      const { auth, owner, person } = await instance();
      const client = await registerClient(auth, owner);
      const tokens = await code(auth, person, client, 'openid roles');
      const claims = verifyJwt(String(tokens.id_token), await publishedKeys(auth)).payload;
      expect(claims.roles).toEqual(['platform:user']);
    });
  });

  describe('token lifetimes', () => {
    it('are 15 minutes for the access token, 1 hour for the ID token, 30 days for the refresh token', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const before = Date.now();
      const { tokens } = await signInTo(auth, owner, client, { scope: 'openid offline_access' });
      const body = tokens.body as Record<string, string | number>;
      expect(body.expires_in).toBe(ACCESS_TOKEN_SECONDS);
      expect(ACCESS_TOKEN_SECONDS).toBe(15 * 60);
      const jwt = verifyJwt(String(body.id_token), await publishedKeys(auth));
      expect(Number(jwt.payload.exp) - Number(jwt.payload.iat)).toBe(ID_TOKEN_SECONDS);
      expect(ID_TOKEN_SECONDS).toBe(3600);

      const { rows } = await db.run('select expires_at from oauth_refresh_tokens');
      const expiresAt = new Date(rows[0]?.expires_at as string | number).getTime();
      expect(expiresAt - before).toBeGreaterThan(REFRESH_TOKEN_SECONDS * 1000 - 60_000);
      expect(expiresAt - before).toBeLessThan(REFRESH_TOKEN_SECONDS * 1000 + 60_000);
      expect(REFRESH_TOKEN_SECONDS).toBe(30 * 24 * 60 * 60);
    });

    it('give a refresh token only to a client that asks for offline_access', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const without = await signInTo(auth, owner, client, { scope: 'openid profile' });
      expect((without.tokens.body as Record<string, unknown>).refresh_token).toBeUndefined();
      const withIt = await signInTo(auth, owner, client, { scope: 'openid offline_access' });
      expect((withIt.tokens.body as Record<string, unknown>).refresh_token).toBeTruthy();
    });
  });

  describe('refresh tokens', () => {
    it('give a new access token and a new refresh token, each time, and the old one stops working', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { tokens } = await signInTo(auth, owner, client, { scope: 'openid offline_access' });
      const first = String((tokens.body as { refresh_token: string }).refresh_token);

      const second = await refresh(auth, client, first);
      expect(second.status).toBe(200);
      const secondToken = String(second.body.refresh_token);
      expect(secondToken).not.toBe(first);
      expect(second.body.access_token).toBeTruthy();

      const third = await refresh(auth, client, secondToken);
      expect(third.status).toBe(200);
      expect(String(third.body.refresh_token)).not.toBe(secondToken);
    });

    it('refuses a refresh token that was already used, and takes away every token the client holds for that person', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { tokens } = await signInTo(auth, owner, client, { scope: 'openid offline_access' });
      const original = String((tokens.body as { refresh_token: string }).refresh_token);
      const rotated = await refresh(auth, client, original);
      const live = String(rotated.body.refresh_token);
      const liveAccess = String(rotated.body.access_token);
      expect((await userInfo(auth, liveAccess)).status).toBe(200);

      // The old token comes back, as a thief's copy would.
      const replay = await refresh(auth, client, original);
      expect(replay.status).toBeGreaterThanOrEqual(400);
      expect(replay.body.error).toBe('invalid_grant');

      // The rotated one is gone too, and so is the access token it came with.
      const after = await refresh(auth, client, live);
      expect(after.status).toBeGreaterThanOrEqual(400);
      expect((await userInfo(auth, liveAccess)).status).toBeGreaterThanOrEqual(400);
    });

    it('takes away the tokens of that client only, not another client’s for the same person', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const other = await registerClient(auth, owner);
      const mine = (await signInTo(auth, owner, client, { scope: 'openid offline_access' })).tokens;
      const theirs = (await signInTo(auth, owner, other, { scope: 'openid offline_access' }))
        .tokens;
      const refreshToken = String((mine.body as { refresh_token: string }).refresh_token);
      await refresh(auth, client, refreshToken);
      await refresh(auth, client, refreshToken);
      const stillWorks = await refresh(
        auth,
        other,
        String((theirs.body as { refresh_token: string }).refresh_token),
      );
      expect(stillWorks.status).toBe(200);
    });

    it('cannot be used by another client', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const other = await registerClient(auth, owner);
      const { tokens } = await signInTo(auth, owner, client, { scope: 'openid offline_access' });
      const stolen = await refresh(
        auth,
        other,
        String((tokens.body as { refresh_token: string }).refresh_token),
      );
      expect(stolen.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('what is stored', () => {
    it('keeps a client secret hashed, never as it was shown, and the tokens hashed too', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { tokens } = await signInTo(auth, owner, client, { scope: 'openid offline_access' });
      const body = tokens.body as Record<string, string>;
      const stored = (await db.run('select client_secret from oauth_clients')).rows[0]
        ?.client_secret;
      expect(stored).toBeTruthy();
      expect(stored).not.toBe(client.secret);
      const accessTokens = (await db.run('select token from oauth_access_tokens')).rows.map(
        (r) => r.token,
      );
      const refreshTokens = (await db.run('select token from oauth_refresh_tokens')).rows.map(
        (r) => r.token,
      );
      expect(accessTokens).not.toContain(body.access_token);
      expect(refreshTokens).not.toContain(body.refresh_token);
      expect(accessTokens.length + refreshTokens.length).toBeGreaterThan(0);
    });

    it('is a client secret shown once and long enough to be unguessable', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      expect((client.secret ?? '').length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('who may register a client', () => {
    const create = (auth: Auth, jar: Jar) =>
      call(auth, 'POST', '/oauth2/create-client', {
        jar,
        body: { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' },
      });

    it('is the owner, and an admin while the matrix gives admins client:manage', async () => {
      const { auth, owner, person, ownerId, personId } = await instance();
      expect((await create(auth, owner)).status).toBeLessThan(300);
      expect((await create(auth, person)).status).toBeGreaterThanOrEqual(400);

      await changeRole(db, { id: ownerId, role: ROLE_OWNER }, personId, ROLE_ADMIN);
      expect((await create(auth, person)).status).toBeLessThan(300);
    });

    it('is nobody who is not signed in', async () => {
      const { auth } = await instance();
      const reply = await call(auth, 'POST', '/oauth2/create-client', {
        body: { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
    });

    it('stops being an admin’s when the owner takes client:manage away, and stays the owner’s', async () => {
      const { auth, owner, person, ownerId, personId } = await instance();
      await changeRole(db, { id: ownerId, role: ROLE_OWNER }, personId, ROLE_ADMIN);
      expect((await create(auth, person)).status).toBeLessThan(300);
      await changeCapabilities(db, { id: ownerId, role: ROLE_OWNER }, [
        { role: ROLE_ADMIN, capability: 'client:manage', granted: false },
      ]);
      expect((await create(auth, person)).status).toBeGreaterThanOrEqual(400);
      expect((await create(auth, owner)).status).toBeLessThan(300);
    });

    it('lets every operator see and manage every client, since they are the instance’s', async () => {
      const { auth, owner, person, ownerId, personId } = await instance();
      const made = await create(auth, owner);
      await changeRole(db, { id: ownerId, role: ROLE_OWNER }, personId, ROLE_ADMIN);
      const listed = await call(auth, 'GET', '/oauth2/get-clients', { jar: person, origin: null });
      expect(listed.status).toBeLessThan(300);
      const clients = (listed.body as unknown as { client_id: string }[]) ?? [];
      expect(clients.map((c) => c.client_id)).toContain(made.body.client_id);
    });

    it('does not let an ordinary person list clients', async () => {
      const { auth, owner, person } = await instance();
      await create(auth, owner);
      const listed = await call(auth, 'GET', '/oauth2/get-clients', { jar: person, origin: null });
      expect(listed.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('a client that is switched off', () => {
    it('cannot authorize or exchange, and is back when switched on again', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      await db.run('update oauth_clients set disabled = ?', [db.family === 'postgres' ? true : 1]);
      const blocked = await authorize(auth, owner, client, { challenge: pkce().challenge });
      expect(blocked.code).toBeUndefined();
      await db.run('update oauth_clients set disabled = ?', [db.family === 'postgres' ? false : 0]);
      const again = await authorize(auth, owner, client, { challenge: pkce().challenge });
      expect(again.code).toBeTruthy();
    });
  });

  describe('introspection and revocation', () => {
    it('says an access token is active, then not after it is revoked', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const { tokens } = await signInTo(auth, owner, client, { scope: 'openid' });
      const access = String((tokens.body as { access_token: string }).access_token);
      const active = await formPost(auth, '/oauth2/introspect', { token: access }, client);
      expect(active.body.active).toBe(true);
      await formPost(auth, '/oauth2/revoke', { token: access }, client);
      const inactive = await formPost(auth, '/oauth2/introspect', { token: access }, client);
      expect(inactive.body.active).toBe(false);
      expect((await userInfo(auth, access)).status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('the signing keys', () => {
    const keyRows = async () =>
      (await db.run('select id, created_at, expires_at from jwks order by created_at')).rows.map(
        (r) => ({
          id: String(r.id),
          createdAt: new Date(r.created_at as string | number).getTime(),
          expiresAt:
            r.expires_at === null ? null : new Date(r.expires_at as string | number).getTime(),
        }),
      );
    const DAY = 24 * 60 * 60 * 1000;

    it('are made to last 90 days, with the old one kept published for 30 more', async () => {
      expect(KEY_ROTATION_SECONDS).toBe(90 * 24 * 60 * 60);
      expect(KEY_GRACE_SECONDS).toBe(30 * 24 * 60 * 60);
      const { auth, owner } = await instance();
      await signInTo(auth, owner, await registerClient(auth, owner), { scope: 'openid' });
      const [key] = await keyRows();
      expect(key?.expiresAt).not.toBeNull();
      const lasts = (key?.expiresAt as number) - (key?.createdAt as number);
      expect(lasts).toBeGreaterThan(89 * DAY);
      expect(lasts).toBeLessThan(91 * DAY);
    });

    it('rotate: once the key has expired a new one signs, and the old one is still published', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      const first = await signInTo(auth, owner, client, { scope: 'openid' });
      const oldKid = verifyJwt(
        String((first.tokens.body as { id_token: string }).id_token),
        await publishedKeys(auth),
      ).header.kid;

      // The key passes its 90 days.
      const expired = Date.now() - DAY;
      await db.run('update jwks set expires_at = ?', [
        db.family === 'postgres' ? new Date(expired) : expired,
      ]);

      const fresh = makeAuth(db);
      const second = await signInTo(fresh, owner, client, { scope: 'openid' });
      const secondToken = String((second.tokens.body as { id_token: string }).id_token);
      const keys = await publishedKeys(fresh);
      const newKid = verifyJwt(secondToken, keys).header.kid;
      expect(newKid).not.toBe(oldKid);
      // A token signed by the old key still verifies during the grace period.
      expect(keys.map((k) => k.kid)).toEqual(
        expect.arrayContaining([oldKid as string, newKid as string]),
      );
    });

    it('are no longer published once the grace period has passed', async () => {
      const { auth, owner } = await instance();
      const client = await registerClient(auth, owner);
      await signInTo(auth, owner, client, { scope: 'openid' });
      const longGone = Date.now() - 31 * DAY;
      await db.run('update jwks set expires_at = ?', [
        db.family === 'postgres' ? new Date(longGone) : longGone,
      ]);
      const fresh = makeAuth(db);
      await signInTo(fresh, owner, client, { scope: 'openid' });
      const rows = await keyRows();
      expect(rows.length).toBe(2);
      const keys = await publishedKeys(fresh);
      expect(keys).toHaveLength(1);
    });

    it('keep the private key encrypted in the database, never as plain JWK text', async () => {
      const { auth, owner } = await instance();
      await signInTo(auth, owner, await registerClient(auth, owner), { scope: 'openid' });
      const privateKey = String(
        (await db.run('select private_key from jwks')).rows[0]?.private_key,
      );
      expect(privateKey).not.toContain('kty');
      expect(privateKey).not.toContain('"d"');
      expect(privateKey).not.toMatch(/[{}]/);
    });
  });
}
