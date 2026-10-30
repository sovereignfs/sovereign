import type { Database } from '@sovereignfs/database';
import type { Auth } from '../auth/auth';
import { can } from '../roles/capabilities';
import { loadMatrix } from '../roles/matrix';
import { parseMetadata } from '../oauth/client-metadata';
import { ensureRs256Key, idTokenAlgorithmOf, type IdTokenAlgorithm } from '../oauth/id-token-alg';
import { revokeAppTokens } from '../oauth/revocation';
import { APP_SCOPES } from '../oauth/scopes';
import { NAMES } from '../oauth/schema-names';
import { isSystemActor, runAsSystem, type SystemActor } from './system-actor';
import { urlListProblems, urlProblem, scopeProblems, textProblem, type Problem } from './validate';

/** The settings of an app (core-app §3.7.1) and its launcher entry (§3.7.2), as the Console shows and sets them. */
export type ClientSettings = {
  /** The name people see, in the consent page and the launcher. */
  name: string;
  /** Confidential has a secret; public has none. PKCE is required of both. */
  type: 'confidential' | 'public';
  /**
   * Where a confidential app puts its secret when it asks for tokens: in a header (HTTP Basic, the usual way) or in
   * the request body. An app whose library can only do the second needs `body` (core-app §3.7.1). A public app has
   * no secret, so it is always `header` here and cannot be given `body`.
   */
  secretIn: 'header' | 'body';
  /**
   * How the app's ID tokens are signed: EdDSA, or RS256 for an app whose library cannot verify EdDSA (core-app
   * §3.6.1). Either kind of app may choose it.
   */
  idTokenAlgorithm: IdTokenAlgorithm;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  backchannelLogoutUri: string | undefined;
  /** Lets the app send people to core's sign-out. On whenever a post-logout or back-channel address is set. */
  endSession: boolean;
  scopes: string[];
  /**
   * What the app may do for itself, with no person present (core-app §3.6.6, §3.7.1): the scopes of its own token. None unless an
   * operator gives one, and only a confidential app can hold any. Not the scopes above, which a person grants.
   */
  appScopes: string[];
  /** An operator vouches for the app: no consent, and `roles` allowed. Off unless set. */
  trusted: boolean;
  enabled: boolean;
  launcher: {
    description: string | undefined;
    icon: string | undefined;
    launchUrl: string | undefined;
    show: boolean;
  };
};

export type ClientView = ClientSettings & { clientId: string; createdAt: Date | undefined };

export type ClientRegistryErrorCode = 'forbidden' | 'invalid' | 'not-found' | 'public-client';

export class ClientRegistryError extends Error {
  override name = 'ClientRegistryError';

  constructor(
    readonly code: ClientRegistryErrorCode,
    message: string,
    /** For `invalid`: every thing wrong, so a form can show each beside its field. */
    readonly problems: readonly Problem[] = [],
  ) {
    super(message);
  }
}

/** An account (its role is what `client:manage` is judged by) and the request it is asking in. */
export type UserActor = { user: { id: string; role: unknown }; headers: Headers };

/** Who is asking: an account, or the system actor `sovereign-admin` acts as (core-app §3.7.4). */
export type RegistryActor = UserActor | SystemActor;

/** What a managed app's key looks like: a DNS label (core-app §3.7.4). */
const MANAGED_KEY = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** What is given to change an app: any of its settings, and any part of its launcher entry. */
export type UpdateInput = Omit<Partial<ClientSettings>, 'launcher'> & {
  launcher?: Partial<ClientSettings['launcher']>;
};
export type RegisterInput = UpdateInput & Pick<ClientSettings, 'name'>;

export type ClientRow = {
  clientId: string;
  name?: string | null;
  icon?: string | null;
  skipConsent?: boolean | null;
  disabled?: boolean | null;
  enableEndSession?: boolean | null;
  tokenEndpointAuthMethod?: string | null;
  scopes?: string[] | null;
  clientCredentialsScopes?: string[] | null;
  redirectUris?: string[] | null;
  postLogoutRedirectUris?: string[] | null;
  backchannelLogoutUri?: string | null;
  metadata?: Record<string, unknown> | string | null;
  createdAt?: Date | string | number | null;
};

export const DEFAULT_SCOPES = ['openid', 'profile', 'email'];
/** What the plugin is given to make the client with: a valid address, replaced by the real ones straight after. */
const PLACEHOLDER = 'https://client.invalid/callback';

/**
 * The only writer of client rows (core-app §3.7.3). An app is registered through the OAuth provider, so its
 * secret is made and hashed the way the provider expects and its defaults apply; everything else core
 * decides (the trusted flag, the launcher entry, a development address) is written through the provider's own
 * adapter, which stores and returns lists and objects properly on every database, and never through Drizzle's
 * schema objects. Every rule of §3.7.1 is applied here, once, whoever is asking, and the provider's own
 * HTTP endpoints for writing clients are switched off (`auth.ts`), so nothing reaches a client row around it.
 *
 * Every method needs `client:manage` in the matrix in force, read from the database, and the request's own
 * cookies for the provider to see who is asking. Nothing here returns a secret except the call that makes or
 * rotates it, which shows it once.
 */
export class ClientRegistry {
  readonly #auth: Auth;
  readonly #database: Database;
  readonly #development: boolean;

  constructor(auth: Auth, database: Database, options: { development: boolean }) {
    this.#auth = auth;
    this.#database = database;
    this.#development = options.development;
  }

  async #require(actor: RegistryActor): Promise<void> {
    if (isSystemActor(actor)) return;
    if (
      !('user' in actor) ||
      !can(actor.user.role, 'client:manage', await loadMatrix(this.#database))
    ) {
      throw new ClientRegistryError('forbidden', 'Only an operator who manages apps can do that.');
    }
  }

  /** Runs a call to the provider as the system actor when that is who is asking, since the provider asks for a session. */
  #provider<T>(actor: RegistryActor, call: () => Promise<T>): Promise<T> {
    return isSystemActor(actor) ? runAsSystem(call) : call();
  }

  async #adapter() {
    return (await this.#auth.$context).adapter;
  }

  async #row(clientId: string): Promise<ClientRow | undefined> {
    const row = await (
      await this.#adapter()
    ).findOne<ClientRow>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: clientId }],
    });
    return row ?? undefined;
  }

  /** Registers an app. A confidential one is returned with its secret, which is shown this once. */
  async register(
    actor: RegistryActor,
    input: RegisterInput,
  ): Promise<{ client: ClientView; secret: string | undefined }> {
    await this.#require(actor);
    const settings = this.#settingsFor(undefined, input);

    const created = (await this.#provider(actor, () =>
      this.#auth.api.adminCreateOAuthClient({
        body: {
          redirect_uris: [PLACEHOLDER],
          client_name: settings.name,
          scope: settings.scopes.join(' '),
          token_endpoint_auth_method: settings.type === 'public' ? 'none' : 'client_secret_basic',
          grant_types: ['authorization_code', 'refresh_token'],
        },
        headers: actor.headers,
      }),
    )) as { client_id: string; client_secret?: string };

    await this.#write(created.client_id, settings);
    await this.#publishKeysFor(settings);
    const client = await this.get(actor, created.client_id);
    return { client, secret: settings.type === 'confidential' ? created.client_secret : undefined };
  }

  /** Changes what is given; the rest is left. Trusting stops with `roles` taken away at the same time. */
  async update(actor: RegistryActor, clientId: string, input: UpdateInput): Promise<ClientView> {
    await this.#require(actor);
    const current = await this.#row(clientId);
    if (!current) throw new ClientRegistryError('not-found', 'There is no such app.');
    const before = clientView(current);
    if (input.type !== undefined && input.type !== before.type) {
      throw new ClientRegistryError(
        'invalid',
        'An app cannot change between public and confidential.',
        [{ field: 'type', message: 'cannot be changed: register a new app instead' }],
      );
    }
    const settings = this.#settingsFor(before, input);
    await this.#write(clientId, settings);
    await this.#publishKeysFor(settings);
    // Switching an app off ends the tokens it holds for itself at once; switching it on again does not bring them back.
    if (before.enabled && !settings.enabled) await revokeAppTokens(this.#database, clientId);
    return this.get(actor, clientId);
  }

  /** Stops new authorizations and refreshes, or restores them; the launcher hides a disabled app. */
  async setEnabled(actor: RegistryActor, clientId: string, enabled: boolean): Promise<ClientView> {
    return this.update(actor, clientId, { enabled });
  }

  /** A new secret, shown once; the old one stops working at once (core-app §3.7.3). */
  async rotateSecret(actor: RegistryActor, clientId: string): Promise<string> {
    await this.#require(actor);
    const row = await this.#row(clientId);
    if (!row) throw new ClientRegistryError('not-found', 'There is no such app.');
    if (clientView(row).type === 'public') {
      throw new ClientRegistryError('public-client', 'A public app has no secret to rotate.');
    }
    const rotated = (await this.#provider(actor, () =>
      this.#auth.api.rotateClientSecret({
        body: { client_id: clientId },
        headers: actor.headers,
      }),
    )) as { client_secret?: string };
    if (!rotated.client_secret) throw new Error('the provider made no secret');
    // The old secret is dead, and so is every token made with it (core-app §3.6.6).
    await revokeAppTokens(this.#database, clientId);
    return rotated.client_secret;
  }

  /** Deletes an app, and every token and consent issued for it: nothing it was given is accepted after. */
  async remove(actor: RegistryActor, clientId: string): Promise<void> {
    await this.#require(actor);
    if (!(await this.#row(clientId)))
      throw new ClientRegistryError('not-found', 'There is no such app.');
    // The tokens and consents go first, explicitly, so the result does not depend on a database's
    // cascade; the access tokens before the refresh tokens they point to.
    await this.#database.transaction(async (tx) => {
      for (const table of [NAMES.accessTokens, NAMES.refreshTokens, NAMES.consents]) {
        const column =
          table === NAMES.accessTokens
            ? NAMES.access.clientId
            : table === NAMES.refreshTokens
              ? NAMES.refresh.clientId
              : NAMES.consent.clientId;
        await tx.run(`delete from ${table} where ${column} = ?`, [clientId]);
      }
      await tx.run(`delete from ${NAMES.managed.table} where ${NAMES.managed.clientId} = ?`, [
        clientId,
      ]);
    });
    await this.#provider(actor, () =>
      this.#auth.api.deleteOAuthClient({
        body: { client_id: clientId },
        headers: actor.headers,
      }),
    );
  }

  /**
   * Makes the app that has `key`, or changes it to match `input` (core-app §3.7.4). Run twice with the same input it
   * changes nothing and makes one app. A list given is the whole list. The secret is returned only when the app is
   * made. Every rule of §3.7.1 applies, since it is `register` and `update` that write.
   */
  async ensure(
    actor: RegistryActor,
    key: string,
    input: RegisterInput,
  ): Promise<{ client: ClientView; secret: string | undefined; created: boolean }> {
    await this.#require(actor);
    if (!MANAGED_KEY.test(key)) {
      throw new ClientRegistryError('invalid', 'The key cannot be used.', [
        { field: 'key', message: 'is a DNS label: lower-case letters, digits and hyphens' },
      ]);
    }
    for (let attempt = 0; ; attempt++) {
      const existing = await this.#managedClientId(key);
      if (existing) {
        const before = await this.get(actor, existing);
        const wanted = this.#settingsFor(before, input);
        if (sameSettings(before, wanted))
          return { client: before, secret: undefined, created: false };
        return {
          client: await this.update(actor, existing, input),
          secret: undefined,
          created: false,
        };
      }
      const made = await this.register(actor, input);
      try {
        await this.#database.run(
          `insert into ${NAMES.managed.table} (${NAMES.managed.key}, ${NAMES.managed.clientId}, ${NAMES.managed.createdAt}) values (?, ?, ?)`,
          [key, made.client.clientId, Date.now()],
        );
      } catch (error) {
        // Another run took the key between the look and the insert: its app stays and this one is taken back.
        await this.remove(actor, made.client.clientId);
        if (attempt === 0 && (await this.#managedClientId(key))) continue;
        throw error;
      }
      return { client: made.client, secret: made.secret, created: true };
    }
  }

  /** The apps that have a key, with it, for `sovereign-admin apps list`. */
  async managed(actor: RegistryActor): Promise<Array<{ key: string; client: ClientView }>> {
    await this.#require(actor);
    const { rows } = await this.#database.run(
      `select ${NAMES.managed.key} as key, ${NAMES.managed.clientId} as client_id from ${NAMES.managed.table} order by ${NAMES.managed.key}`,
    );
    const clients = new Map((await this.list(actor)).map((client) => [client.clientId, client]));
    return rows.flatMap((row) => {
      const client = clients.get(String(row.client_id));
      return client ? [{ key: String(row.key), client }] : [];
    });
  }

  /** Which of the apps are managed from the command line, so the Console can say so. */
  async managedClientIds(actor: RegistryActor): Promise<Set<string>> {
    await this.#require(actor);
    const { rows } = await this.#database.run(
      `select ${NAMES.managed.clientId} as client_id from ${NAMES.managed.table}`,
    );
    return new Set(rows.map((row) => String(row.client_id)));
  }

  /** The app a key names. */
  async clientIdOfKey(actor: RegistryActor, key: string): Promise<string> {
    await this.#require(actor);
    const clientId = await this.#managedClientId(key);
    if (!clientId) throw new ClientRegistryError('not-found', 'There is no app with that key.');
    return clientId;
  }

  async #managedClientId(key: string): Promise<string | undefined> {
    const { rows } = await this.#database.run(
      `select ${NAMES.managed.clientId} as client_id from ${NAMES.managed.table} where ${NAMES.managed.key} = ?`,
      [key],
    );
    return rows[0] ? String(rows[0].client_id) : undefined;
  }

  async get(actor: RegistryActor, clientId: string): Promise<ClientView> {
    await this.#require(actor);
    const row = await this.#row(clientId);
    if (!row) throw new ClientRegistryError('not-found', 'There is no such app.');
    return clientView(row);
  }

  async list(actor: RegistryActor): Promise<ClientView[]> {
    await this.#require(actor);
    const rows = await (await this.#adapter()).findMany<ClientRow>({ model: 'oauthClient' });
    return rows
      .map((row) => clientView(row))
      .sort((a, b) => a.name.localeCompare(b.name) || a.clientId.localeCompare(b.clientId));
  }

  /** The settings that result from `input` laid over what the app has (nothing, for a new app), or why not. */
  #settingsFor(
    before: ClientView | undefined,
    input: UpdateInput & { name?: string },
  ): ClientSettings {
    const trusted = input.trusted ?? before?.trusted ?? false;
    const wasTrusted = before?.trusted ?? false;
    const problems: Problem[] = [];

    const name = input.name ?? before?.name;
    const nameProblem = textProblem(name, 100, true);
    if (nameProblem) problems.push({ field: 'name', message: nameProblem });

    const redirect = urlListProblems(
      'redirectUris',
      input.redirectUris ?? before?.redirectUris,
      this.#development,
      { required: true },
    );
    const logout = urlListProblems(
      'postLogoutRedirectUris',
      input.postLogoutRedirectUris ?? before?.postLogoutRedirectUris ?? [],
      this.#development,
      { required: false },
    );
    problems.push(...redirect.problems, ...logout.problems);

    const backchannel =
      'backchannelLogoutUri' in input ? input.backchannelLogoutUri : before?.backchannelLogoutUri;
    if (backchannel !== undefined && backchannel !== '') {
      const problem = urlProblem(backchannel, this.#development);
      if (problem) problems.push({ field: 'backchannelLogoutUri', message: problem });
    }

    // Stopping trust takes `roles` with it, quietly: it is the consequence, not a mistake. Asking for
    // `roles` for an untrusted app is a mistake, and is refused.
    let requested: unknown = input.scopes ?? before?.scopes ?? DEFAULT_SCOPES;
    if (input.scopes === undefined && wasTrusted && !trusted && Array.isArray(requested)) {
      requested = requested.filter((scope) => scope !== 'roles');
    }
    const scopes = scopeProblems('scopes', requested, trusted);
    problems.push(...scopes.problems);

    const launcher = { ...before?.launcher, ...input.launcher };
    const description = textProblem(launcher.description, 280, false);
    if (description) problems.push({ field: 'launcher.description', message: description });
    if (launcher.icon !== undefined && launcher.icon !== '') {
      const problem = urlProblem(launcher.icon, this.#development);
      if (problem) problems.push({ field: 'launcher.icon', message: problem });
    }
    if (launcher.launchUrl !== undefined && launcher.launchUrl !== '') {
      const problem = urlProblem(launcher.launchUrl, this.#development);
      if (problem) problems.push({ field: 'launcher.launchUrl', message: problem });
    }
    for (const [field, value] of [
      ['trusted', input.trusted],
      ['enabled', input.enabled],
      ['endSession', input.endSession],
      ['launcher.show', input.launcher?.show],
    ] as const) {
      if (value !== undefined && typeof value !== 'boolean') {
        problems.push({ field, message: 'must be on or off' });
      }
    }
    if (input.type !== undefined && input.type !== 'confidential' && input.type !== 'public') {
      problems.push({ field: 'type', message: 'is confidential or public' });
    }
    const idTokenAlgorithm = input.idTokenAlgorithm ?? before?.idTokenAlgorithm ?? 'EdDSA';
    if (idTokenAlgorithm !== 'EdDSA' && idTokenAlgorithm !== 'RS256') {
      problems.push({ field: 'idTokenAlgorithm', message: 'is EdDSA or RS256' });
    }
    const secretIn = input.secretIn ?? before?.secretIn ?? 'header';
    if (secretIn !== 'header' && secretIn !== 'body') {
      problems.push({ field: 'secretIn', message: 'is a header or the request body' });
    } else if (secretIn === 'body' && (input.type ?? before?.type ?? 'confidential') === 'public') {
      problems.push({ field: 'secretIn', message: 'cannot be set: a public app has no secret' });
    }
    const appScopes = input.appScopes ?? before?.appScopes ?? [];
    if (
      !Array.isArray(appScopes) ||
      appScopes.some((name) => !(APP_SCOPES as readonly string[]).includes(String(name)))
    ) {
      problems.push({ field: 'appScopes', message: `must be ${APP_SCOPES.join(' or ')}` });
    } else if (
      appScopes.length > 0 &&
      (input.type ?? before?.type ?? 'confidential') === 'public'
    ) {
      problems.push({
        field: 'appScopes',
        message: 'cannot be set: a public app has no secret to act for itself with',
      });
    }
    if (problems.length > 0) {
      throw new ClientRegistryError(
        'invalid',
        'Some of what was entered cannot be used.',
        problems,
      );
    }

    const postLogoutRedirectUris = logout.list;
    const backchannelLogoutUri = backchannel === '' ? undefined : backchannel;
    return {
      name: (name as string).trim(),
      type: input.type ?? before?.type ?? 'confidential',
      secretIn,
      idTokenAlgorithm,
      redirectUris: redirect.list,
      postLogoutRedirectUris,
      backchannelLogoutUri,
      // On automatically when an address that needs it is set (core-app §3.7.1).
      endSession:
        (input.endSession ?? before?.endSession ?? false) ||
        postLogoutRedirectUris.length > 0 ||
        backchannelLogoutUri !== undefined,
      scopes: scopes.list,
      appScopes: [...new Set(appScopes.map(String))],
      trusted,
      enabled: input.enabled ?? before?.enabled ?? true,
      launcher: {
        description: blank(launcher.description),
        icon: blank(launcher.icon),
        launchUrl: blank(launcher.launchUrl),
        show: launcher.show ?? true,
      },
    };
  }

  /** An app set to RS256 needs the RSA key published before it signs anyone in, not when its first token is made. */
  async #publishKeysFor(settings: ClientSettings): Promise<void> {
    if (settings.idTokenAlgorithm === 'RS256') await ensureRs256Key(await this.#auth.$context);
  }

  /** Writes settings that have passed `#settingsFor`, through the provider's adapter. */
  async #write(clientId: string, settings: ClientSettings): Promise<void> {
    await (
      await this.#adapter()
    ).update({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: clientId }],
      update: {
        name: settings.name,
        icon: settings.launcher.icon ?? null,
        // The method the provider holds the client to at the token endpoint: it refuses any other (core-app §3.6.1).
        tokenEndpointAuthMethod:
          settings.type === 'public'
            ? 'none'
            : settings.secretIn === 'body'
              ? 'client_secret_post'
              : 'client_secret_basic',
        redirectUris: settings.redirectUris,
        postLogoutRedirectUris:
          settings.postLogoutRedirectUris.length > 0 ? settings.postLogoutRedirectUris : null,
        backchannelLogoutUri: settings.backchannelLogoutUri ?? null,
        backchannelLogoutSessionRequired: settings.backchannelLogoutUri !== undefined,
        enableEndSession: settings.endSession,
        scopes: settings.scopes,
        // The grant an app uses to act for itself, and what it may ask for with it. The provider holds the app to this list.
        grantTypes:
          settings.type === 'confidential' && settings.appScopes.length > 0
            ? ['authorization_code', 'refresh_token', 'client_credentials']
            : ['authorization_code', 'refresh_token'],
        clientCredentialsScopes: settings.type === 'confidential' ? settings.appScopes : [],
        skipConsent: settings.trusted,
        disabled: !settings.enabled,
        metadata: {
          launcher: {
            description: settings.launcher.description ?? null,
            launchUrl: settings.launcher.launchUrl ?? null,
            show: settings.launcher.show,
          },
          // Kept only when it is not the default, so an app that never chose it has the metadata it always had.
          ...(settings.idTokenAlgorithm === 'RS256' ? { idTokenAlgorithm: 'RS256' } : {}),
        },
        updatedAt: new Date(),
      },
    });
  }
}

/** One stored app as the Console and the launcher read it: lists and objects as the provider kept them. */
export function clientView(row: ClientRow): ClientView {
  const metadata = parseMetadata(row.metadata);
  const launcher = (metadata.launcher ?? {}) as Record<string, unknown>;
  return {
    clientId: row.clientId,
    name: row.name ?? '',
    type: row.tokenEndpointAuthMethod === 'none' ? 'public' : 'confidential',
    secretIn: row.tokenEndpointAuthMethod === 'client_secret_post' ? 'body' : 'header',
    idTokenAlgorithm: idTokenAlgorithmOf(metadata),
    redirectUris: list(row.redirectUris),
    postLogoutRedirectUris: list(row.postLogoutRedirectUris),
    backchannelLogoutUri: blank(row.backchannelLogoutUri),
    endSession: row.enableEndSession === true,
    scopes: list(row.scopes),
    appScopes: list(row.clientCredentialsScopes),
    trusted: row.skipConsent === true,
    enabled: row.disabled !== true,
    launcher: {
      description: blank(launcher.description),
      icon: blank(row.icon),
      launchUrl: blank(launcher.launchUrl),
      show: launcher.show !== false,
    },
    createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
  };
}

/** Whether the settings an app has are the ones asked for, so `ensure` writes nothing when they are. */
function sameSettings(has: ClientView, wanted: ClientSettings): boolean {
  const { clientId: _clientId, createdAt: _createdAt, ...current } = has;
  const stable = (value: unknown): string =>
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item,
    );
  return stable(current) === stable(wanted);
}

const blank = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
