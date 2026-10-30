/**
 * The client registry (core-app §3.7) against a real database, through the OAuth provider: registering,
 * changing, disabling, rotating and deleting an app, who may, and what each does to what the app holds. One
 * suite, run by `clients.test.ts` on a SQLite file and by `clients.db.test.ts` on whichever dialect the CI
 * leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER } from '../auth/roles';
import { ClientRegistry, ClientRegistryError, type RegistryActor } from '../clients/registry';
import { runAdmin } from '../admin/run';
import { systemActor } from '../clients/system-actor';
import { migrateCore } from '../db/migrate';
import { changeCapabilities } from '../roles/configure';
import { changeRole } from '../roles/people';
import { Jar, PASSWORD, call, makeAuth, signUp } from './auth-harness';
import {
  REDIRECT,
  actorOf,
  authorize,
  exchangeCode,
  formPost,
  pkce,
  publishedKeys,
  refresh,
  signInTo,
  userInfo,
  useDatabase,
} from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'managed_clients',
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

export function clientsSuite(createDatabase: () => Promise<TestDatabase>): void {
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

  /** An owner, an ordinary person, and a registry for a development instance. */
  async function instance(options: { development?: boolean } = {}) {
    const auth = makeAuth(db);
    const owner = await signUp(auth);
    const person = await signUp(auth);
    const idOf = async (email: string) =>
      String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
    const registry = new ClientRegistry(auth, db, { development: options.development ?? true });
    return {
      auth,
      registry,
      owner: owner.jar,
      ownerId: await idOf(owner.email),
      person: person.jar,
      personId: await idOf(person.email),
      asOwner: await actorOf(auth, owner.jar),
      asPerson: await actorOf(auth, person.jar),
    };
  }

  const settings = (extra: Record<string, unknown> = {}) => ({
    name: 'Notes',
    redirectUris: [REDIRECT],
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    ...extra,
  });
  const refused = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      return error instanceof ClientRegistryError ? error : (error as Error);
    }
    return undefined;
  };
  const rowOf = async (clientId: string) =>
    (await db.run('select * from oauth_clients where client_id = ?', [clientId])).rows[0];
  const clientCount = async () =>
    Number((await db.run('select count(*) as n from oauth_clients')).rows[0]?.n);

  describe('registering an app', () => {
    it('makes a confidential app with a secret shown once and stored only as a hash', async () => {
      const { registry, asOwner } = await instance();
      const { client, secret } = await registry.register(asOwner, settings());
      expect(client).toMatchObject({
        name: 'Notes',
        type: 'confidential',
        redirectUris: [REDIRECT],
        trusted: false,
        enabled: true,
        endSession: false,
        postLogoutRedirectUris: [],
        backchannelLogoutUri: undefined,
        scopes: ['openid', 'profile', 'email', 'offline_access'],
      });
      expect(secret).toBeTruthy();
      expect((secret ?? '').length).toBeGreaterThanOrEqual(32);
      const stored = (await rowOf(client.clientId))?.client_secret;
      expect(stored).toBeTruthy();
      expect(stored).not.toBe(secret);
      // Nothing it returns later carries the secret.
      expect(JSON.stringify(await registry.get(asOwner, client.clientId))).not.toContain(secret);
      expect(JSON.stringify(await registry.list(asOwner))).not.toContain(secret);
    });

    it('has the app send its secret in a header unless said otherwise', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(asOwner, settings());
      expect(client.secretIn).toBe('header');
      expect((await rowOf(client.clientId))?.token_endpoint_auth_method).toBe(
        'client_secret_basic',
      );
    });

    it('makes an app that sends its secret in the request body, and changes it either way', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(asOwner, settings({ secretIn: 'body' }));
      expect(client.secretIn).toBe('body');
      expect((await rowOf(client.clientId))?.token_endpoint_auth_method).toBe('client_secret_post');

      const back = await registry.update(asOwner, client.clientId, { secretIn: 'header' });
      expect(back.secretIn).toBe('header');
      expect((await rowOf(client.clientId))?.token_endpoint_auth_method).toBe(
        'client_secret_basic',
      );
      const again = await registry.update(asOwner, client.clientId, { secretIn: 'body' });
      expect(again.secretIn).toBe('body');
      // Saving something else leaves the choice as it was.
      expect((await registry.update(asOwner, client.clientId, { name: 'Notes 2' })).secretIn).toBe(
        'body',
      );
    });

    it('does not give a public app a way to send a secret it does not have', async () => {
      const { registry, asOwner } = await instance();
      const error = (await refused(() =>
        registry.register(asOwner, settings({ type: 'public', secretIn: 'body' })),
      )) as ClientRegistryError;
      expect(error.problems.map((problem) => problem.field)).toEqual(['secretIn']);
      expect(await clientCount()).toBe(0);

      const pub = (await registry.register(asOwner, settings({ type: 'public' }))).client;
      expect(pub.secretIn).toBe('header');
      expect((await rowOf(pub.clientId))?.token_endpoint_auth_method).toBe('none');
      expect(
        (
          (await refused(() =>
            registry.update(asOwner, pub.clientId, { secretIn: 'body' }),
          )) as ClientRegistryError
        ).problems[0]?.field,
      ).toBe('secretIn');
      expect((await rowOf(pub.clientId))?.token_endpoint_auth_method).toBe('none');
    });

    it('refuses a value that is neither a header nor the body, beside its field', async () => {
      const { registry, asOwner } = await instance();
      const error = (await refused(() =>
        registry.register(asOwner, settings({ secretIn: 'query' })),
      )) as ClientRegistryError;
      expect(error.problems[0]?.field).toBe('secretIn');
      expect(await clientCount()).toBe(0);
    });

    describe('the token endpoint holds an app to the way it was registered', () => {
      /** A fresh authorization code for the app, and the verifier that goes with it. */
      const codeFor = async (
        auth: Awaited<ReturnType<typeof instance>>['auth'],
        owner: Awaited<ReturnType<typeof instance>>['owner'],
        app: { clientId: string; secret: string | undefined },
      ) => {
        const { verifier, challenge } = pkce();
        const issued = await authorize(auth, owner, app, { scope: 'openid profile', challenge });
        return { code: String(issued.code), verifier };
      };
      const exchange = (
        auth: Awaited<ReturnType<typeof instance>>['auth'],
        app: { clientId: string; secret: string | undefined },
        step: { code: string; verifier: string },
        how: 'basic' | 'post',
      ) =>
        formPost(
          auth,
          '/oauth2/token',
          {
            grant_type: 'authorization_code',
            code: step.code,
            redirect_uri: REDIRECT,
            code_verifier: step.verifier,
          },
          app,
          how,
        );

      it('takes a secret in the body from an app registered for it, and not one in a header', async () => {
        const { auth, registry, owner, asOwner } = await instance();
        const made = await registry.register(
          asOwner,
          settings({ secretIn: 'body', trusted: true }),
        );
        const app = { clientId: made.client.clientId, secret: made.secret };

        const inBody = await exchange(auth, app, await codeFor(auth, owner, app), 'post');
        expect(inBody.status).toBe(200);
        expect(inBody.body.id_token).toBeTruthy();

        const inHeader = await exchange(auth, app, await codeFor(auth, owner, app), 'basic');
        expect(inHeader.status).toBeGreaterThanOrEqual(400);
        expect(inHeader.body.error).toBe('invalid_client');
      });

      it('takes a secret in a header from an app registered for that, and refuses one in the body', async () => {
        const { auth, registry, owner, asOwner } = await instance();
        const made = await registry.register(asOwner, settings({ trusted: true }));
        const app = { clientId: made.client.clientId, secret: made.secret };

        expect((await exchange(auth, app, await codeFor(auth, owner, app), 'basic')).status).toBe(
          200,
        );
        const inBody = await exchange(auth, app, await codeFor(auth, owner, app), 'post');
        expect(inBody.body.error).toBe('invalid_client');
        expect(String(inBody.body.error_description)).toContain('client_secret_basic');
      });

      it('still wants the secret itself: a wrong one in the body is refused', async () => {
        const { auth, registry, owner, asOwner } = await instance();
        const made = await registry.register(
          asOwner,
          settings({ secretIn: 'body', trusted: true }),
        );
        const app = { clientId: made.client.clientId, secret: made.secret };
        const wrong = await exchange(
          auth,
          { ...app, secret: 'not-the-secret' },
          await codeFor(auth, owner, app),
          'post',
        );
        expect(wrong.body.error).toBe('invalid_client');
      });

      it('moves with the choice: after a change, the old way is refused and the new one works', async () => {
        const { auth, registry, owner, asOwner } = await instance();
        const made = await registry.register(asOwner, settings({ trusted: true }));
        const app = { clientId: made.client.clientId, secret: made.secret };
        await registry.update(asOwner, app.clientId, { secretIn: 'body' });
        expect(
          (await exchange(auth, app, await codeFor(auth, owner, app), 'basic')).body.error,
        ).toBe('invalid_client');
        expect((await exchange(auth, app, await codeFor(auth, owner, app), 'post')).status).toBe(
          200,
        );
      });
    });

    describe('how its tokens are signed', () => {
      /** The kinds of key the instance publishes, as a relying party would read them. */
      const kinds = async (auth: Awaited<ReturnType<typeof instance>>['auth']) =>
        (await publishedKeys(auth)).map((key) => key.kty).sort();

      it('is EdDSA unless said otherwise, and leaves the app’s metadata as it always was', async () => {
        const { registry, asOwner } = await instance();
        const { client } = await registry.register(asOwner, settings());
        expect(client.idTokenAlgorithm).toBe('EdDSA');
        expect(String((await rowOf(client.clientId))?.metadata)).not.toContain('idTokenAlgorithm');
      });

      it('can be RS256 for either kind of app, changed either way, and kept when something else is saved', async () => {
        const { registry, asOwner } = await instance();
        const { client } = await registry.register(
          asOwner,
          settings({ idTokenAlgorithm: 'RS256' }),
        );
        expect(client.idTokenAlgorithm).toBe('RS256');
        const pub = await registry.register(
          asOwner,
          settings({ type: 'public', idTokenAlgorithm: 'RS256' }),
        );
        expect(pub.client.idTokenAlgorithm).toBe('RS256');

        expect(
          (await registry.update(asOwner, client.clientId, { name: 'Notes 2' })).idTokenAlgorithm,
        ).toBe('RS256');
        expect(
          (await registry.update(asOwner, client.clientId, { idTokenAlgorithm: 'EdDSA' }))
            .idTokenAlgorithm,
        ).toBe('EdDSA');
        expect(
          (await registry.update(asOwner, client.clientId, { idTokenAlgorithm: 'RS256' }))
            .idTokenAlgorithm,
        ).toBe('RS256');
      });

      it('keeps the launcher entry beside it', async () => {
        const { registry, asOwner } = await instance();
        const { client } = await registry.register(
          asOwner,
          settings({
            idTokenAlgorithm: 'RS256',
            launcher: { description: 'Take notes', show: true },
          }),
        );
        const again = await registry.get(asOwner, client.clientId);
        expect(again.launcher.description).toBe('Take notes');
        expect(again.idTokenAlgorithm).toBe('RS256');
      });

      it('refuses any other algorithm, beside its field, and makes nothing', async () => {
        const { registry, asOwner } = await instance();
        const error = (await refused(() =>
          registry.register(asOwner, settings({ idTokenAlgorithm: 'none' })),
        )) as ClientRegistryError;
        expect(error.problems[0]?.field).toBe('idTokenAlgorithm');
        expect(await clientCount()).toBe(0);
      });

      it('publishes the RSA key as soon as an app is set to it, before any token, and only then', async () => {
        const { auth, registry, asOwner } = await instance();
        await registry.register(asOwner, settings());
        expect(await kinds(auth)).not.toContain('RSA');

        await registry.register(asOwner, settings({ idTokenAlgorithm: 'RS256' }));
        const keys = await publishedKeys(auth);
        const rsa = keys.find((key) => key.kty === 'RSA');
        expect(rsa).toMatchObject({ alg: 'RS256', kty: 'RSA', e: 'AQAB' });
        expect(rsa?.kid).toBeTruthy();
        // No curve on an RSA key, and the EdDSA key keeps its own.
        expect(rsa && 'crv' in rsa).toBe(false);
        expect(keys.find((key) => key.kty === 'OKP')?.crv).toBe('Ed25519');
      });

      it('is also made when an existing app is changed to it', async () => {
        const { auth, registry, asOwner } = await instance();
        const { client } = await registry.register(asOwner, settings());
        await registry.update(asOwner, client.clientId, { idTokenAlgorithm: 'RS256' });
        expect(await kinds(auth)).toContain('RSA');
      });

      it('is made again when the key set is read and the key is gone, for as long as an app needs it', async () => {
        const { auth, registry, asOwner } = await instance();
        await registry.register(asOwner, settings({ idTokenAlgorithm: 'RS256' }));
        const first = (await publishedKeys(auth)).find((key) => key.kty === 'RSA')?.kid;
        await db.run("delete from jwks where alg = 'RS256'");
        const again = (await publishedKeys(auth)).find((key) => key.kty === 'RSA')?.kid;
        expect(again).toBeTruthy();
        expect(again).not.toBe(first);
      });

      it('is made again when it has expired, and the old one stays published through its grace', async () => {
        const { auth, registry, asOwner } = await instance();
        await registry.register(asOwner, settings({ idTokenAlgorithm: 'RS256' }));
        const first = (await publishedKeys(auth)).find((key) => key.kty === 'RSA')?.kid;
        const context = await auth.$context;
        await context.adapter.update({
          model: 'jwks',
          where: [{ field: 'alg', value: 'RS256' }],
          update: { expiresAt: new Date(Date.now() - 60_000) },
        });
        const kids = (await publishedKeys(auth))
          .filter((key) => key.kty === 'RSA')
          .map((key) => key.kid);
        expect(kids).toHaveLength(2);
        expect(kids).toContain(first);
      });

      it('never shows the RSA key while no app is set to it, so an instance that never chose it is as it was', async () => {
        const { auth, registry, asOwner } = await instance();
        await registry.register(asOwner, settings());
        expect(await kinds(auth)).toEqual(['OKP']);
      });
    });

    it('makes a public app with no secret', async () => {
      const { registry, asOwner } = await instance();
      const { client, secret } = await registry.register(asOwner, settings({ type: 'public' }));
      expect(secret).toBeUndefined();
      expect(client.type).toBe('public');
      expect((await rowOf(client.clientId))?.client_secret).toBeNull();
    });

    it('is untrusted, enabled and out of the launcher’s way unless said otherwise', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(asOwner, settings());
      expect(client.trusted).toBe(false);
      expect(client.enabled).toBe(true);
      expect(client.launcher).toEqual({
        description: undefined,
        icon: undefined,
        launchUrl: undefined,
        show: true,
      });
    });

    it('keeps the lists and the launcher entry as they were given, on every database', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(
        asOwner,
        settings({
          redirectUris: [REDIRECT, 'https://rp.example.com/other'],
          postLogoutRedirectUris: ['https://rp.example.com/bye'],
          backchannelLogoutUri: 'https://rp.example.com/backchannel',
          trusted: true,
          scopes: ['openid', 'roles'],
          launcher: {
            description: 'Your notes, wherever you are',
            icon: 'https://rp.example.com/icon.png',
            launchUrl: 'https://rp.example.com/',
            show: false,
          },
        }),
      );
      const read = await registry.get(asOwner, client.clientId);
      expect(read).toEqual(client);
      expect(read).toMatchObject({
        redirectUris: [REDIRECT, 'https://rp.example.com/other'],
        postLogoutRedirectUris: ['https://rp.example.com/bye'],
        backchannelLogoutUri: 'https://rp.example.com/backchannel',
        trusted: true,
        scopes: ['openid', 'roles'],
        launcher: {
          description: 'Your notes, wherever you are',
          icon: 'https://rp.example.com/icon.png',
          launchUrl: 'https://rp.example.com/',
          show: false,
        },
      });
    });

    it('turns end-session on by itself when an address that needs it is set, and never off under one', async () => {
      const { registry, asOwner } = await instance();
      const plain = (await registry.register(asOwner, settings())).client;
      const withLogout = (
        await registry.register(
          asOwner,
          settings({ postLogoutRedirectUris: ['https://rp.example.com/bye'] }),
        )
      ).client;
      const withBackchannel = (
        await registry.register(
          asOwner,
          settings({ backchannelLogoutUri: 'https://rp.example.com/bc' }),
        )
      ).client;
      const forced = (await registry.register(asOwner, settings({ endSession: true }))).client;
      expect([plain, withLogout, withBackchannel, forced].map((c) => c.endSession)).toEqual([
        false,
        true,
        true,
        true,
      ]);
      const off = await registry.update(asOwner, withLogout.clientId, { endSession: false });
      expect(off.endSession).toBe(true);
    });

    it('is refused, with everything that is wrong said at once and each beside its field, and makes nothing', async () => {
      const { registry, asOwner } = await instance();
      const error = (await refused(() =>
        registry.register(asOwner, {
          name: '',
          redirectUris: ['http://example.com/cb'],
          postLogoutRedirectUris: ['https://rp.example.com/bye#x'],
          backchannelLogoutUri: 'ftp://x',
          scopes: ['profile'],
        }),
      )) as ClientRegistryError;
      expect(error.code).toBe('invalid');
      expect(error.problems.map((p) => p.field).sort()).toEqual(
        ['backchannelLogoutUri', 'name', 'postLogoutRedirectUris', 'redirectUris', 'scopes'].sort(),
      );
      expect(await clientCount()).toBe(0);
    });

    it('does not make an app whose address the provider alone would have refused, nor leave a half-made one', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(
        asOwner,
        settings({ redirectUris: ['http://app.localhost:3000/cb', 'http://localhost:4000/cb'] }),
      );
      expect(client.redirectUris).toEqual([
        'http://app.localhost:3000/cb',
        'http://localhost:4000/cb',
      ]);
      expect(await clientCount()).toBe(1);
    });
  });

  describe('addresses', () => {
    it('are https on a production instance, and http is refused even on localhost', async () => {
      const { registry, asOwner } = await instance({ development: false });
      for (const uri of [
        'http://localhost:4000/cb',
        'http://app.localhost/cb',
        'http://rp.example.com/cb',
      ]) {
        const error = (await refused(() =>
          registry.register(asOwner, settings({ redirectUris: [uri] })),
        )) as ClientRegistryError;
        expect(error.code, uri).toBe('invalid');
      }
      expect(await clientCount()).toBe(0);
      expect(
        (
          await registry.register(
            asOwner,
            settings({ redirectUris: ['https://rp.example.com/cb'] }),
          )
        ).client.redirectUris,
      ).toEqual(['https://rp.example.com/cb']);
    });

    it('are accepted as http for localhost and *.localhost on a development instance', async () => {
      const { registry, asOwner } = await instance({ development: true });
      for (const uri of ['http://localhost:4000/cb', 'http://app.localhost:3000/cb']) {
        expect(
          (await registry.register(asOwner, settings({ redirectUris: [uri] }))).client.redirectUris,
        ).toEqual([uri]);
      }
      const other = (await refused(() =>
        registry.register(asOwner, settings({ redirectUris: ['http://rp.example.com/cb'] })),
      )) as ClientRegistryError;
      expect(other.code).toBe('invalid');
    });

    it('are the ones the app can sign in with: a development address works end to end', async () => {
      const { auth, registry, asOwner, person } = await instance({ development: true });
      const { client, secret } = await registry.register(
        asOwner,
        settings({ redirectUris: ['http://app.localhost:3000/cb'], trusted: true }),
      );
      const registered = { clientId: client.clientId, secret };
      const { verifier, challenge } = pkce();
      const { code } = await authorize(auth, person, registered, {
        scope: 'openid',
        redirectUri: 'http://app.localhost:3000/cb',
        challenge,
      });
      expect(code).toBeTruthy();
      expect(
        (
          await exchangeCode(
            auth,
            registered,
            code as string,
            verifier,
            'http://app.localhost:3000/cb',
          )
        ).status,
      ).toBe(200);
    });
  });

  describe('roles', () => {
    it('cannot be allowed to an untrusted app, when it is made or when it is changed', async () => {
      const { registry, asOwner } = await instance();
      const made = (await refused(() =>
        registry.register(asOwner, settings({ scopes: ['openid', 'roles'] })),
      )) as ClientRegistryError;
      expect(made.problems).toEqual([
        { field: 'scopes', message: 'roles is only for a trusted app' },
      ]);

      const { client } = await registry.register(asOwner, settings());
      const changed = (await refused(() =>
        registry.update(asOwner, client.clientId, { scopes: ['openid', 'roles'] }),
      )) as ClientRegistryError;
      expect(changed.code).toBe('invalid');
      expect((await registry.get(asOwner, client.clientId)).scopes).not.toContain('roles');
    });

    it('is allowed to a trusted app, and taken away when the app stops being trusted', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(
        asOwner,
        settings({ trusted: true, scopes: ['openid', 'profile', 'roles'] }),
      );
      expect(client.scopes).toContain('roles');
      const stopped = await registry.update(asOwner, client.clientId, { trusted: false });
      expect(stopped.trusted).toBe(false);
      expect(stopped.scopes).toEqual(['openid', 'profile']);
      // Trusting it again does not bring roles back by itself.
      expect((await registry.update(asOwner, client.clientId, { trusted: true })).scopes).toEqual([
        'openid',
        'profile',
      ]);
    });

    it('is refused in the same request that stops trusting, because that is a contradiction', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(
        asOwner,
        settings({ trusted: true, scopes: ['openid', 'roles'] }),
      );
      const error = (await refused(() =>
        registry.update(asOwner, client.clientId, { trusted: false, scopes: ['openid', 'roles'] }),
      )) as ClientRegistryError;
      expect(error.code).toBe('invalid');
      expect((await registry.get(asOwner, client.clientId)).trusted).toBe(true);
    });
  });

  describe('changing an app', () => {
    it('changes what is given and leaves the rest', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(
        asOwner,
        settings({ launcher: { description: 'Notes', launchUrl: 'https://rp.example.com/' } }),
      );
      const changed = await registry.update(asOwner, client.clientId, {
        name: '  Notes 2  ',
        redirectUris: ['https://rp.example.com/new'],
        launcher: { show: false },
      });
      expect(changed).toMatchObject({
        name: 'Notes 2',
        redirectUris: ['https://rp.example.com/new'],
        scopes: client.scopes,
        launcher: { description: 'Notes', launchUrl: 'https://rp.example.com/', show: false },
      });
    });

    it('can clear an optional address, and a launcher field', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(
        asOwner,
        settings({
          backchannelLogoutUri: 'https://rp.example.com/bc',
          launcher: { description: 'x', icon: 'https://rp.example.com/i.png' },
        }),
      );
      const cleared = await registry.update(asOwner, client.clientId, {
        backchannelLogoutUri: undefined,
        postLogoutRedirectUris: [],
        launcher: { description: '', icon: '' },
      });
      expect(cleared.backchannelLogoutUri).toBeUndefined();
      expect(cleared.launcher.description).toBeUndefined();
      expect(cleared.launcher.icon).toBeUndefined();
    });

    it('cannot turn a public app into a confidential one, or back', async () => {
      const { registry, asOwner } = await instance();
      const pub = (await registry.register(asOwner, settings({ type: 'public' }))).client;
      const error = (await refused(() =>
        registry.update(asOwner, pub.clientId, { type: 'confidential' }),
      )) as ClientRegistryError;
      expect(error.problems[0]?.field).toBe('type');
      expect((await registry.get(asOwner, pub.clientId)).type).toBe('public');
    });

    it('says an app that is not there is not there', async () => {
      const { registry, asOwner } = await instance();
      for (const run of [
        () => registry.get(asOwner, 'nope'),
        () => registry.update(asOwner, 'nope', { name: 'x' }),
        () => registry.setEnabled(asOwner, 'nope', false),
        () => registry.rotateSecret(asOwner, 'nope'),
        () => registry.remove(asOwner, 'nope'),
      ]) {
        expect(((await refused(run)) as ClientRegistryError).code).toBe('not-found');
      }
    });

    it('lists every app, by name, whoever made it', async () => {
      const { registry, asOwner } = await instance();
      await registry.register(asOwner, settings({ name: 'Zed' }));
      await registry.register(asOwner, settings({ name: 'Alpha' }));
      expect((await registry.list(asOwner)).map((c) => c.name)).toEqual(['Alpha', 'Zed']);
    });
  });

  describe('disabling', () => {
    it('stops sign-in and refreshing, and is undone by enabling', async () => {
      const { auth, registry, asOwner, person } = await instance();
      const { client, secret } = await registry.register(
        asOwner,
        settings({ trusted: true, scopes: ['openid', 'offline_access'] }),
      );
      const app = { clientId: client.clientId, secret };
      const { tokens } = await signInTo(auth, person, app, { scope: 'openid offline_access' });
      const refreshToken = String(tokens.body.refresh_token);

      expect((await registry.setEnabled(asOwner, client.clientId, false)).enabled).toBe(false);
      expect(
        (await authorize(auth, person, app, { challenge: pkce().challenge })).code,
      ).toBeUndefined();
      expect((await refresh(auth, app, refreshToken)).status).toBeGreaterThanOrEqual(400);

      expect((await registry.setEnabled(asOwner, client.clientId, true)).enabled).toBe(true);
      expect(
        (await authorize(auth, person, app, { challenge: pkce().challenge })).code,
      ).toBeTruthy();
      expect((await refresh(auth, app, refreshToken)).status).toBe(200);
    });
  });

  describe('rotating the secret', () => {
    it('makes the old one fail at once and the new one work, and stores only a hash of it', async () => {
      const { auth, registry, asOwner, person } = await instance();
      const { client, secret: first } = await registry.register(
        asOwner,
        settings({ trusted: true }),
      );
      const before = (await rowOf(client.clientId))?.client_secret;

      const second = await registry.rotateSecret(asOwner, client.clientId);
      expect(second).not.toBe(first);
      expect((await rowOf(client.clientId))?.client_secret).not.toBe(before);
      expect((await rowOf(client.clientId))?.client_secret).not.toBe(second);

      const exchange = async (secret: string | undefined) => {
        const { verifier, challenge } = pkce();
        const app = { clientId: client.clientId, secret };
        const { code } = await authorize(auth, person, app, { scope: 'openid', challenge });
        return exchangeCode(auth, app, code as string, verifier);
      };
      const old = await exchange(first);
      expect(old.status).toBe(401);
      expect(old.body.error).toBe('invalid_client');
      expect((await exchange(second)).status).toBe(200);
    });

    it('has nothing to do for a public app', async () => {
      const { registry, asOwner } = await instance();
      const { client } = await registry.register(asOwner, settings({ type: 'public' }));
      expect(
        (
          (await refused(() =>
            registry.rotateSecret(asOwner, client.clientId),
          )) as ClientRegistryError
        ).code,
      ).toBe('public-client');
    });
  });

  describe('deleting an app', () => {
    it('takes every token and consent with it: nothing the app was given is accepted after', async () => {
      const { auth, registry, asOwner, owner, person } = await instance();
      const { client, secret } = await registry.register(
        asOwner,
        settings({ scopes: ['openid', 'profile', 'offline_access'] }),
      );
      const app = { clientId: client.clientId, secret };
      // Consent for one person, tokens for two.
      const asked = await authorize(auth, person, app, {
        scope: 'openid profile offline_access',
        challenge: pkce().challenge,
      });
      const signed = new URLSearchParams(String(asked.url?.search));
      const names = new Set(signed.getAll('ba_param'));
      const query = new URLSearchParams();
      for (const [k, v] of signed.entries())
        if (k === 'sig' || k === 'ba_param' || names.has(k)) query.append(k, v);
      await call(auth, 'POST', '/oauth2/consent', {
        jar: person,
        body: { accept: true, oauth_query: query.toString() },
      });
      const { verifier, challenge } = pkce();
      const { code } = await authorize(auth, person, app, {
        scope: 'openid profile offline_access',
        challenge,
      });
      const mine = await exchangeCode(auth, app, code as string, verifier);
      expect(mine.status).toBe(200);
      await registry.update(asOwner, client.clientId, { trusted: true });
      const theirs = (await signInTo(auth, owner, app, { scope: 'openid offline_access' })).tokens;

      await registry.remove(asOwner, client.clientId);

      expect(await rowOf(client.clientId)).toBeUndefined();
      for (const table of ['oauth_access_tokens', 'oauth_refresh_tokens', 'oauth_consents']) {
        expect(Number((await db.run(`select count(*) as n from ${table}`)).rows[0]?.n), table).toBe(
          0,
        );
      }
      for (const tokens of [mine, theirs]) {
        expect(
          (await userInfo(auth, String(tokens.body.access_token))).status,
        ).toBeGreaterThanOrEqual(400);
        expect(
          (await refresh(auth, app, String(tokens.body.refresh_token))).status,
        ).toBeGreaterThanOrEqual(400);
        expect(
          (
            await formPost(
              auth,
              '/oauth2/introspect',
              { token: String(tokens.body.access_token) },
              app,
            )
          ).body.active,
        ).not.toBe(true);
      }
    });

    it('leaves another app’s tokens and consents alone', async () => {
      const { auth, registry, asOwner, person } = await instance();
      const gone = await registry.register(
        asOwner,
        settings({ trusted: true, scopes: ['openid', 'offline_access'] }),
      );
      const kept = await registry.register(
        asOwner,
        settings({ trusted: true, scopes: ['openid', 'offline_access'] }),
      );
      const keptApp = { clientId: kept.client.clientId, secret: kept.secret };
      const { tokens } = await signInTo(auth, person, keptApp, { scope: 'openid offline_access' });
      await signInTo(
        auth,
        person,
        { clientId: gone.client.clientId, secret: gone.secret },
        { scope: 'openid' },
      );
      await registry.remove(asOwner, gone.client.clientId);
      expect((await userInfo(auth, String(tokens.body.access_token))).status).toBe(200);
      expect((await refresh(auth, keptApp, String(tokens.body.refresh_token))).status).toBe(200);
    });
  });

  describe('who may', () => {
    it('manage apps: the owner, and an admin while the matrix gives admins client:manage; never an ordinary person', async () => {
      const { auth, registry, owner, asOwner, asPerson, ownerId, personId, person } =
        await instance();
      void owner;
      for (const run of [
        () => registry.register(asPerson, settings()),
        () => registry.list(asPerson),
        () => registry.get(asPerson, 'x'),
        () => registry.update(asPerson, 'x', { name: 'x' }),
        () => registry.setEnabled(asPerson, 'x', false),
        () => registry.rotateSecret(asPerson, 'x'),
        () => registry.remove(asPerson, 'x'),
      ]) {
        expect(((await refused(run)) as ClientRegistryError).code).toBe('forbidden');
      }
      expect(await clientCount()).toBe(0);

      await registry.register(asOwner, settings());
      await changeRole(db, { id: ownerId, role: ROLE_OWNER }, personId, ROLE_ADMIN);
      const asAdmin = await actorOf(auth, person);
      expect(asAdmin.user.role).toBe(ROLE_ADMIN);
      expect(
        (await registry.register(asAdmin, settings({ name: 'By the admin' }))).client.name,
      ).toBe('By the admin');
    });

    it('is a second admin’s as much as the first’s: every operator can rotate, edit, disable and delete any app', async () => {
      const { auth, registry, asOwner, ownerId, personId, person } = await instance();
      const { client } = await registry.register(asOwner, settings({ trusted: false }));
      await changeRole(db, { id: ownerId, role: ROLE_OWNER }, personId, ROLE_ADMIN);
      const asAdmin = await actorOf(auth, person);

      expect((await registry.list(asAdmin)).map((c) => c.clientId)).toContain(client.clientId);
      expect((await registry.update(asAdmin, client.clientId, { name: 'Renamed' })).name).toBe(
        'Renamed',
      );
      expect((await registry.setEnabled(asAdmin, client.clientId, false)).enabled).toBe(false);
      expect(await registry.rotateSecret(asAdmin, client.clientId)).toBeTruthy();
      await registry.remove(asAdmin, client.clientId);
      expect(await clientCount()).toBe(0);
    });

    it('stops being an admin’s when the owner takes client:manage away, and stays the owner’s', async () => {
      const { auth, registry, asOwner, ownerId, personId, person } = await instance();
      await changeRole(db, { id: ownerId, role: ROLE_OWNER }, personId, ROLE_ADMIN);
      const asAdmin = await actorOf(auth, person);
      await registry.register(asAdmin, settings());
      await changeCapabilities(db, { id: ownerId, role: ROLE_OWNER }, [
        { role: ROLE_ADMIN, capability: 'client:manage', granted: false },
      ]);
      expect(((await refused(() => registry.list(asAdmin))) as ClientRegistryError).code).toBe(
        'forbidden',
      );
      expect((await registry.list(asOwner)).length).toBe(1);
    });

    it('is nobody who is not signed in: the provider refuses the request that carries no session', async () => {
      const { auth, registry, asOwner } = await instance();
      void asOwner;
      const nobody: RegistryActor = { user: { id: 'x', role: ROLE_OWNER }, headers: new Headers() };
      // The role is claimed, but the request is nobody's: the provider looks at the cookies, not the claim.
      const error = await refused(() => registry.register(nobody, settings()));
      expect(error).toBeDefined();
      expect(await clientCount()).toBe(0);
      void auth;
    });

    it('is nobody whose role is not one core knows', async () => {
      const { registry, asOwner } = await instance();
      const odd: RegistryActor = { ...asOwner, user: { id: 'x', role: 'platform:superuser' } };
      expect(((await refused(() => registry.list(odd))) as ClientRegistryError).code).toBe(
        'forbidden',
      );
    });
  });

  describe('managed apps and the system actor', () => {
    const key = 'notes';
    const managedRows = async () => (await db.run('select * from managed_clients')).rows;

    it('makes the app the first time, with a secret, and finds the same app the next', async () => {
      const { registry } = await instance();
      const system = systemActor();
      const first = await registry.ensure(system, key, settings());
      expect(first.created).toBe(true);
      expect(first.secret).toMatch(/\S{20,}/);
      expect(first.client).toMatchObject({ name: 'Notes', type: 'confidential', enabled: true });
      expect(await managedRows()).toHaveLength(1);

      const second = await registry.ensure(system, key, settings());
      expect(second.created).toBe(false);
      expect(second.secret).toBeUndefined();
      expect(second.client.clientId).toBe(first.client.clientId);
      expect(await clientCount()).toBe(1);
      expect(await managedRows()).toHaveLength(1);
    });

    it('changes nothing when run again with the same arguments, not even the row’s time', async () => {
      const { registry } = await instance();
      const system = systemActor();
      const { client } = await registry.ensure(system, key, settings());
      const before = await rowOf(client.clientId);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await registry.ensure(system, key, settings());
      expect(await rowOf(client.clientId)).toEqual(before);
    });

    it('takes the list it is given as the whole list, so an address left out is removed', async () => {
      const { registry } = await instance();
      const system = systemActor();
      const other = 'https://notes.example.test/second';
      const { client } = await registry.ensure(
        system,
        key,
        settings({ redirectUris: [REDIRECT, other] }),
      );
      expect(client.redirectUris).toEqual([REDIRECT, other]);
      const changed = await registry.ensure(
        system,
        key,
        settings({ redirectUris: [other], name: 'Notes, renamed' }),
      );
      expect(changed.client).toMatchObject({ name: 'Notes, renamed', redirectUris: [other] });
      expect(changed.client.clientId).toBe(client.clientId);
      expect(changed.secret).toBeUndefined();
    });

    it('applies every rule the Console does, with the same refusals, and makes nothing then', async () => {
      const { registry } = await instance({ development: false });
      const system = systemActor();
      const error = (await refused(() =>
        registry.ensure(system, key, settings({ redirectUris: ['http://notes.example.test/cb'] })),
      )) as ClientRegistryError;
      expect(error.code).toBe('invalid');
      expect(error.problems.map((problem) => problem.field)).toContain('redirectUris');
      const roles = (await refused(() =>
        registry.ensure(system, key, settings({ scopes: ['openid', 'roles'] })),
      )) as ClientRegistryError;
      expect(roles.code).toBe('invalid');
      expect(await clientCount()).toBe(0);
      expect(await managedRows()).toHaveLength(0);
    });

    it('refuses a key that is not a DNS label, and a change from public to confidential', async () => {
      const { registry } = await instance();
      const system = systemActor();
      for (const bad of ['', 'Notes', 'no_t', '-a', 'a-', 'a.b', 'x'.repeat(64)]) {
        const error = (await refused(() =>
          registry.ensure(system, bad, settings()),
        )) as ClientRegistryError;
        expect(error.code, bad).toBe('invalid');
      }
      await registry.ensure(system, key, settings());
      const type = (await refused(() =>
        registry.ensure(system, key, settings({ type: 'public' })),
      )) as ClientRegistryError;
      expect(type.code).toBe('invalid');
      expect(await clientCount()).toBe(1);
    });

    it('makes a public app with no secret', async () => {
      const { registry } = await instance();
      const { client, secret } = await registry.ensure(
        systemActor(),
        key,
        settings({ type: 'public' }),
      );
      expect(client.type).toBe('public');
      expect(secret).toBeUndefined();
    });

    it('rotates the secret of the app a key names, and stores only a new hash', async () => {
      const { registry } = await instance();
      const system = systemActor();
      const { client, secret } = await registry.ensure(system, key, settings());
      const clientId = await registry.clientIdOfKey(system, key);
      expect(clientId).toBe(client.clientId);
      const before = (await rowOf(clientId))?.client_secret;
      const rotated = await registry.rotateSecret(system, clientId);
      expect(rotated).not.toBe(secret);
      const after = (await rowOf(clientId))?.client_secret;
      expect(after).not.toBe(before);
      expect(String(after)).not.toContain(rotated);
    });

    it('removes the app a key names, with what it was given, and the key with it', async () => {
      const { registry } = await instance();
      const system = systemActor();
      const { client } = await registry.ensure(system, key, settings());
      await registry.remove(system, await registry.clientIdOfKey(system, key));
      expect(await clientCount()).toBe(0);
      expect(await managedRows()).toHaveLength(0);
      expect(
        ((await refused(() => registry.clientIdOfKey(system, key))) as ClientRegistryError).code,
      ).toBe('not-found');
      // The next run makes a new app with a new secret (core-app §3.7.4).
      const again = await registry.ensure(system, key, settings());
      expect(again.created).toBe(true);
      expect(again.client.clientId).not.toBe(client.clientId);
    });

    it('lists the managed apps with their keys, and says which apps are managed', async () => {
      const { registry, asOwner } = await instance();
      const system = systemActor();
      await registry.ensure(system, 'bravo', settings({ name: 'Bravo' }));
      await registry.ensure(system, 'alpha', settings({ name: 'Alpha' }));
      const byHand = (await registry.register(asOwner, settings({ name: 'By hand' }))).client;
      const listed = await registry.managed(system);
      expect(listed.map(({ key: found }) => found)).toEqual(['alpha', 'bravo']);
      const ids = await registry.managedClientIds(asOwner);
      expect(ids.has(listed[0]?.client.clientId as string)).toBe(true);
      expect(ids.has(byHand.clientId)).toBe(false);
    });

    it('lets a person with client:manage do none of this, and an object that only looks like the actor nothing', async () => {
      const { registry, asPerson, asOwner } = await instance();
      for (const run of [
        () => registry.ensure(asPerson, key, settings()),
        () => registry.managed(asPerson),
        () => registry.managedClientIds(asPerson),
        () => registry.clientIdOfKey(asPerson, key),
      ]) {
        expect(((await refused(run)) as ClientRegistryError).code).toBe('forbidden');
      }
      const forged = { system: true as const, headers: new Headers() };
      expect(
        ((await refused(() => registry.ensure(forged, key, settings()))) as ClientRegistryError)
          .code,
      ).toBe('forbidden');
      expect(await clientCount()).toBe(0);
      // An operator may still ask for the managed apps, since they are apps like any other.
      expect(await registry.managed(asOwner)).toEqual([]);
    });

    it('is reached by no request: the provider’s routes it stands in for are off, for everyone', async () => {
      const { auth, registry, owner } = await instance();
      const { client } = await registry.ensure(systemActor(), key, settings());
      for (const jar of [owner, new Jar()]) {
        for (const route of ['/oauth2/delete-client', '/oauth2/client/rotate-secret']) {
          const reply = await call(auth, 'POST', route, {
            jar,
            body: { client_id: client.clientId },
          });
          expect(reply.status, route).toBe(404);
        }
      }
      expect(await clientCount()).toBe(1);
    });
  });

  describe('the sovereign-admin command', () => {
    const run = async (registry: ClientRegistry, ...argv: string[]) => {
      const out: string[] = [];
      const log: string[] = [];
      const code = await runAdmin(argv, registry, systemActor(), {
        out: (line) => out.push(line),
        log: (line) => log.push(line),
      });
      return { code, out, log };
    };
    const ensureArgs = [
      'apps',
      'ensure',
      'notes',
      '--name',
      'Notes',
      '--redirect',
      REDIRECT,
      '--json',
    ];

    it('makes an app and answers with its client id and its secret, once', async () => {
      const { registry } = await instance();
      const first = await run(registry, ...ensureArgs);
      expect(first.code).toBe(0);
      const answer = JSON.parse(first.out[0] as string) as Record<string, string>;
      expect(Object.keys(answer).sort()).toEqual(['clientId', 'key', 'secret']);
      expect(answer.key).toBe('notes');
      // The log says what was done and which app, and never the secret.
      expect(first.log.join('\n')).toContain('made app notes');
      expect(first.log.join('\n')).not.toContain(answer.secret);

      const second = await run(registry, ...ensureArgs);
      expect(second.code).toBe(0);
      const again = JSON.parse(second.out[0] as string) as Record<string, string>;
      expect(again).toEqual({ key: 'notes', clientId: answer.clientId });
      expect(second.log.join('\n')).toContain('kept app notes');
      expect(await clientCount()).toBe(1);
    });

    it('lists, rotates and removes by key', async () => {
      const { registry } = await instance();
      await run(registry, ...ensureArgs);
      const listed = await run(registry, 'apps', 'list', '--json');
      expect(JSON.parse(listed.out[0] as string)).toMatchObject([
        { key: 'notes', name: 'Notes', type: 'confidential', enabled: true },
      ]);
      const rotated = await run(registry, 'apps', 'rotate-secret', 'notes', '--json');
      expect(rotated.code).toBe(0);
      expect(JSON.parse(rotated.out[0] as string)).toHaveProperty('secret');
      expect(rotated.log.join('\n')).not.toContain(
        (JSON.parse(rotated.out[0] as string) as { secret: string }).secret,
      );
      expect((await run(registry, 'apps', 'remove', 'notes')).code).toBe(0);
      expect(await clientCount()).toBe(0);
      expect(JSON.parse((await run(registry, 'apps', 'list', '--json')).out[0] as string)).toEqual(
        [],
      );
    });

    it('exits 1 with each thing wrong on a line when core refuses, and 2 for a bad command line', async () => {
      const { registry } = await instance({ development: false });
      const refused = await run(
        registry,
        'apps',
        'ensure',
        'notes',
        '--name',
        'Notes',
        '--redirect',
        'http://notes.example.test/cb',
      );
      expect(refused.code).toBe(1);
      expect(refused.log.join('\n')).toMatch(/redirectUris\[?0?\]?.*https/s);
      expect(refused.out).toEqual([]);
      const missing = await run(registry, 'apps', 'rotate-secret', 'nope');
      expect(missing.code).toBe(1);
      expect(missing.log.join('\n')).toContain('no app with that key');
      const usage = await run(registry, 'apps', 'ensure');
      expect(usage.code).toBe(2);
      expect(usage.log.join('\n')).toContain('Usage:');
      expect(await clientCount()).toBe(0);
    });
  });

  describe('the provider’s own routes', () => {
    it('cannot be used to write an app around the registry, by anyone, signed in or not', async () => {
      const { auth, owner, person } = await instance();
      for (const jar of [owner, person, new Jar()]) {
        for (const path of ['/oauth2/create-client', '/oauth2/register', '/oauth2/update-client']) {
          const reply = await call(auth, 'POST', path, {
            jar,
            body: { redirect_uris: [REDIRECT] },
          });
          expect(reply.status, path).toBe(404);
        }
      }
      expect(await clientCount()).toBe(0);
      void PASSWORD;
    });
  });

  describe('where client rows are written', () => {
    it('is in the registry and nowhere else', async () => {
      const { readdirSync, readFileSync, statSync } = await import('node:fs');
      const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
      const files = (dir: string): string[] =>
        readdirSync(dir).flatMap((name) => {
          const full = path.join(dir, name);
          if (name === 'node_modules' || name === '__tests__' || name === '.next') return [];
          return statSync(full).isDirectory()
            ? files(full)
            : /\.(ts|tsx)$/.test(name)
              ? [full]
              : [];
        });
      const sources = [...files(path.join(root, 'src')), ...files(path.join(root, 'app'))].map(
        (file) => ({
          file: path.relative(root, file).split(path.sep).join('/'),
          text: readFileSync(file, 'utf8'),
        }),
      );
      const writers = sources
        .filter(({ text }) =>
          /adminCreateOAuthClient|adminUpdateOAuthClient|rotateClientSecret|deleteOAuthClient|createOAuthClient|updateOAuthClient/.test(
            text,
          ),
        )
        .map(({ file }) => file);
      expect(writers).toEqual(['src/clients/registry.ts']);
      // Reading a client by the provider's adapter is allowed in these places (the consent page, the launcher's
      // tiles, the registry, the guards and the step that signs an app's ID tokens); writing it is allowed in one.
      const readers = sources
        .filter(({ text }) => /model: 'oauthClient'/.test(text))
        .map(({ file }) => file)
        .sort();
      expect(readers).toEqual([
        'app/consent/page.tsx',
        'src/clients/launcher.ts',
        'src/clients/registry.ts',
        'src/oauth/guards.ts',
        'src/oauth/id-token-alg.ts',
      ]);
    });
  });
}
