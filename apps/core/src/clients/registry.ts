import type { Database } from '@sovereignfs/database';
import type { Auth } from '../auth/auth';
import { can } from '../roles/capabilities';
import { loadMatrix } from '../roles/matrix';
import { NAMES } from '../oauth/schema-names';
import { urlListProblems, urlProblem, scopeProblems, textProblem, type Problem } from './validate';

/** The settings of an app (core-app §3.7.1) and its launcher entry (§3.7.2), as the Console shows and sets them. */
export type ClientSettings = {
  /** The name people see, in the consent page and the launcher. */
  name: string;
  /** Confidential has a secret; public has none. PKCE is required of both. */
  type: 'confidential' | 'public';
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  backchannelLogoutUri: string | undefined;
  /** Lets the app send people to core's sign-out. On whenever a post-logout or back-channel address is set. */
  endSession: boolean;
  scopes: string[];
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

/** Who is asking: the account (its role is what `client:manage` is judged by) and the request it is asking in. */
export type RegistryActor = { user: { id: string; role: unknown }; headers: Headers };

/** What is given to change an app: any of its settings, and any part of its launcher entry. */
export type UpdateInput = Omit<Partial<ClientSettings>, 'launcher'> & {
  launcher?: Partial<ClientSettings['launcher']>;
};
export type RegisterInput = UpdateInput & Pick<ClientSettings, 'name'>;

type Row = {
  clientId: string;
  name?: string | null;
  icon?: string | null;
  skipConsent?: boolean | null;
  disabled?: boolean | null;
  enableEndSession?: boolean | null;
  tokenEndpointAuthMethod?: string | null;
  scopes?: string[] | null;
  redirectUris?: string[] | null;
  postLogoutRedirectUris?: string[] | null;
  backchannelLogoutUri?: string | null;
  metadata?: Record<string, unknown> | string | null;
  createdAt?: Date | string | number | null;
};

const DEFAULT_SCOPES = ['openid', 'profile', 'email'];
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
    if (!can(actor.user.role, 'client:manage', await loadMatrix(this.#database))) {
      throw new ClientRegistryError('forbidden', 'Only an operator who manages apps can do that.');
    }
  }

  async #adapter() {
    return (await this.#auth.$context).adapter;
  }

  async #row(clientId: string): Promise<Row | undefined> {
    const row = await (
      await this.#adapter()
    ).findOne<Row>({
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

    const created = (await this.#auth.api.adminCreateOAuthClient({
      body: {
        redirect_uris: [PLACEHOLDER],
        client_name: settings.name,
        scope: settings.scopes.join(' '),
        token_endpoint_auth_method: settings.type === 'public' ? 'none' : 'client_secret_basic',
        grant_types: ['authorization_code', 'refresh_token'],
      },
      headers: actor.headers,
    })) as { client_id: string; client_secret?: string };

    await this.#write(created.client_id, settings);
    const client = await this.get(actor, created.client_id);
    return { client, secret: settings.type === 'confidential' ? created.client_secret : undefined };
  }

  /** Changes what is given; the rest is left. Trusting stops with `roles` taken away at the same time. */
  async update(actor: RegistryActor, clientId: string, input: UpdateInput): Promise<ClientView> {
    await this.#require(actor);
    const current = await this.#row(clientId);
    if (!current) throw new ClientRegistryError('not-found', 'There is no such app.');
    const before = this.#view(current);
    if (input.type !== undefined && input.type !== before.type) {
      throw new ClientRegistryError(
        'invalid',
        'An app cannot change between public and confidential.',
        [{ field: 'type', message: 'cannot be changed: register a new app instead' }],
      );
    }
    const settings = this.#settingsFor(before, input);
    await this.#write(clientId, settings);
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
    if (this.#view(row).type === 'public') {
      throw new ClientRegistryError('public-client', 'A public app has no secret to rotate.');
    }
    const rotated = (await this.#auth.api.rotateClientSecret({
      body: { client_id: clientId },
      headers: actor.headers,
    })) as { client_secret?: string };
    if (!rotated.client_secret) throw new Error('the provider made no secret');
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
    });
    await this.#auth.api.deleteOAuthClient({
      body: { client_id: clientId },
      headers: actor.headers,
    });
  }

  async get(actor: RegistryActor, clientId: string): Promise<ClientView> {
    await this.#require(actor);
    const row = await this.#row(clientId);
    if (!row) throw new ClientRegistryError('not-found', 'There is no such app.');
    return this.#view(row);
  }

  async list(actor: RegistryActor): Promise<ClientView[]> {
    await this.#require(actor);
    const rows = await (await this.#adapter()).findMany<Row>({ model: 'oauthClient' });
    return rows
      .map((row) => this.#view(row))
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
      redirectUris: redirect.list,
      postLogoutRedirectUris,
      backchannelLogoutUri,
      // On automatically when an address that needs it is set (core-app §3.7.1).
      endSession:
        (input.endSession ?? before?.endSession ?? false) ||
        postLogoutRedirectUris.length > 0 ||
        backchannelLogoutUri !== undefined,
      scopes: scopes.list,
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
        redirectUris: settings.redirectUris,
        postLogoutRedirectUris:
          settings.postLogoutRedirectUris.length > 0 ? settings.postLogoutRedirectUris : null,
        backchannelLogoutUri: settings.backchannelLogoutUri ?? null,
        backchannelLogoutSessionRequired: settings.backchannelLogoutUri !== undefined,
        enableEndSession: settings.endSession,
        scopes: settings.scopes,
        skipConsent: settings.trusted,
        disabled: !settings.enabled,
        metadata: {
          launcher: {
            description: settings.launcher.description ?? null,
            launchUrl: settings.launcher.launchUrl ?? null,
            show: settings.launcher.show,
          },
        },
        updatedAt: new Date(),
      },
    });
  }

  #view(row: Row): ClientView {
    const metadata = parseMetadata(row.metadata);
    const launcher = (metadata.launcher ?? {}) as Record<string, unknown>;
    return {
      clientId: row.clientId,
      name: row.name ?? '',
      type: row.tokenEndpointAuthMethod === 'none' ? 'public' : 'confidential',
      redirectUris: list(row.redirectUris),
      postLogoutRedirectUris: list(row.postLogoutRedirectUris),
      backchannelLogoutUri: blank(row.backchannelLogoutUri),
      endSession: row.enableEndSession === true,
      scopes: list(row.scopes),
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
}

const blank = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** The provider stores an object as JSON text on SQLite; read either. */
function parseMetadata(value: unknown): Record<string, unknown> {
  let current = value;
  for (let i = 0; i < 2 && typeof current === 'string'; i++) {
    try {
      current = JSON.parse(current);
    } catch {
      return {};
    }
  }
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {};
}
