import {
  CoreApiError as ApiClientError,
  createCoreClient,
  operations,
  type InstanceBranding,
  type Operations,
} from '@sovereignfs/api-client';
import { Auth } from './auth';
import { CoreApiError, ConfigurationError, SessionEndedError } from './errors';
import { Instance } from './instance';
import { readSettings, type SettingsSource } from './settings';
import type { SessionStore } from './session';
import { TokenManager, type ActorKey, type TokenStore } from './tokens';
import { Transport, type Environment, type Logger } from './transport';

/** A person an app calls core as: what `getSession` returns has a `sub`, and so does `{ sub }`. */
export type Person = { readonly sub: string };

type Name = keyof Operations;
type Answer<K extends Name> = Operations[K]['response'];
type Request<K extends Name> = Operations[K]['request'];

/** The Directory (sdk §8): finding people on the instance. Needs the `directory` scope. */
export interface DirectoryApi {
  searchUsers(
    request: NonNullable<Request<'searchDirectoryUsers'>>['query'],
  ): Promise<Answer<'searchDirectoryUsers'>>;
  resolveUsers(
    request: NonNullable<Request<'resolveDirectoryUsers'>>['body'],
  ): Promise<Answer<'resolveDirectoryUsers'>>;
  findUserByEmail(
    request: NonNullable<Request<'findDirectoryUserByEmail'>>['query'],
  ): Promise<Answer<'findDirectoryUserByEmail'>>;
}

/** A person's notifications from this app (sdk §8, core-app §4.1): the ones the app sent them, never another app's. */
export interface NotificationsApi {
  list(
    request?: NonNullable<Request<'listNotifications'>>['query'],
  ): Promise<Answer<'listNotifications'>>;
  markRead(id: string): Promise<Answer<'markNotificationRead'>>;
  markAllRead(): Promise<Answer<'markAllNotificationsRead'>>;
  dismiss(id: string): Promise<Answer<'dismissNotification'>>;
  dismissAll(): Promise<Answer<'dismissAllNotifications'>>;
}

/** What an app can do as a person. */
export interface PersonClient {
  readonly directory: DirectoryApi;
  readonly notifications: NotificationsApi;
}

/** What an app can do as itself, with no person (sdk §4): tell a person something. */
export interface AppClient {
  readonly notifications: {
    /** Sends a notification. Accepted whether or not the person receives it: core says nothing of them. */
    send(
      message: NonNullable<Request<'sendNotification'>>['body'],
    ): Promise<Answer<'sendNotification'>>;
  };
}

/** What anyone can ask, with no token. */
export interface InstanceApi {
  getBranding(): Promise<InstanceBranding>;
}

/** Addresses of core's own pages for a person, which the SDK offers and has no call for (sdk §9). */
export interface Links {
  readonly profile: string;
  readonly security: string;
  readonly preferences: string;
  readonly connectedApps: string;
  readonly deleteAccount: string;
}

export interface Sovereign {
  /** Calls made as this person, with their token. Needs a token store. */
  as(person: Person): PersonClient;
  /** Calls made as the app itself. It never holds a person's token. */
  readonly app: AppClient;
  /** Public calls. */
  readonly instance: InstanceApi;
  /** Signing people in, their sessions, and signing out (sdk §9). Needs a session store. */
  readonly auth: Auth;
  /** Core's own pages for a person. */
  readonly links: Links;
}

export type SovereignOptions = SettingsSource & {
  /** Where a person's refresh token is kept (sdk §5.1). Needed to call as a person. */
  tokenStore?: TokenStore;
  /** Where the app's sessions are kept (sdk §9.1). Needed to sign people in. */
  sessionStore?: SessionStore;
  /** What the app asks to see when it signs a person in. `openid profile email offline_access` unless changed. */
  scopes?: string[];
  /** The app's callback path, which must be registered with core. `/auth/callback` unless changed. */
  redirectPath?: string;
  /** Where core returns a person after they sign out, which must be registered with core. `/` unless changed. */
  postLogoutPath?: string;
  /** How long a session lasts at most, in seconds. Thirty days unless changed. */
  sessionSeconds?: number;
  /** Each request's timeout. 5 seconds unless changed. */
  timeoutMs?: number;
  /** Told the operation, status and duration of each request, and nothing else. */
  logger?: Logger;
  /** `fetch`, when the runtime has none or a test supplies its own. */
  fetch?: typeof fetch;
  /** The clock, sleep and chance, for a test. */
  environment?: Environment;
};

/** The capability each operation belongs to, which the instance document says is served (sdk §7). */
const CAPABILITY: Partial<Record<Name, string>> = {
  searchDirectoryUsers: 'directory',
  resolveDirectoryUsers: 'directory',
  findDirectoryUserByEmail: 'directory',
  sendNotification: 'notifications',
  listNotifications: 'notifications',
  markNotificationRead: 'notifications',
  markAllNotificationsRead: 'notifications',
  dismissNotification: 'notifications',
  dismissAllNotifications: 'notifications',
};

/**
 * Makes the SDK's client (sdk §2). It reads its settings and makes no network call, so an app starts while core is down.
 * Make one per process.
 */
export function createSovereign(options: SovereignOptions): Sovereign {
  const settings = readSettings(options);
  const transport = new Transport({
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.environment ? { environment: options.environment } : {}),
  });
  const tokens = new TokenManager({
    transport,
    coreUrl: settings.coreUrl,
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
    store: options.tokenStore,
  });
  const instance = new Instance(transport, settings.coreUrl);
  let auth: Auth | undefined;
  const pageOf = (path: string) => new URL(path, settings.coreUrl).toString();

  /** One call to core as an actor, or as nobody, with the specification's rules for tokens, failure and version support. */
  async function execute<K extends Name>(
    actor: ActorKey | undefined,
    name: K,
    request: Request<K>,
  ): Promise<Answer<K>> {
    const deadline = transport.deadline();
    const operation = operations[name];
    const capability = CAPABILITY[name];
    if (capability) await instance.require(capability, deadline);

    for (let attempt = 0; ; attempt += 1) {
      const token = actor ? await tokens.token(actor, deadline) : undefined;
      const core = createCoreClient({
        baseUrl: settings.coreUrl,
        ...(token ? { token } : {}),
        fetch: (input, init) =>
          transport.send(input, init ?? {}, {
            operation: name,
            safeToRepeat: operation.safeToRepeat,
            deadline,
          }),
      });
      try {
        const call = core[name] as (given?: Request<K>) => Promise<Answer<K>>;
        return await call(request);
      } catch (error) {
        if (!(error instanceof ApiClientError)) throw error;
        if (error.status === 404) instance.forget();
        if (error.status === 401 && actor) {
          // The token may have been revoked or rotated away: forget it, and try once with a new one.
          tokens.discard(actor);
          if (attempt === 0) continue;
          if (actor.kind === 'person') {
            throw new SessionEndedError(
              'Core refused this person’s token twice. They must sign in again.',
            );
          }
        }
        throw new CoreApiError(error.status, error.code, error.message, error.retryAfter);
      }
    }
  }

  const directory = (actor: ActorKey): DirectoryApi => ({
    searchUsers: (query) => execute(actor, 'searchDirectoryUsers', { query }),
    resolveUsers: (body) => execute(actor, 'resolveDirectoryUsers', { body }),
    findUserByEmail: (query) => execute(actor, 'findDirectoryUserByEmail', { query }),
  });

  const notifications = (actor: ActorKey): NotificationsApi => ({
    list: (query) => execute(actor, 'listNotifications', query === undefined ? {} : { query }),
    markRead: (id) => execute(actor, 'markNotificationRead', { params: { id } }),
    markAllRead: () => execute(actor, 'markAllNotificationsRead', undefined),
    dismiss: (id) => execute(actor, 'dismissNotification', { params: { id } }),
    dismissAll: () => execute(actor, 'dismissAllNotifications', undefined),
  });

  return {
    as(person) {
      if (typeof person?.sub !== 'string' || person.sub === '') {
        throw new ConfigurationError('A person needs a sub: pass the session or { sub }.');
      }
      if (!options.tokenStore) {
        throw new ConfigurationError(
          'Calling as a person needs a token store: pass tokenStore when creating the client.',
        );
      }
      const actor: ActorKey = { kind: 'person', sub: person.sub };
      return { directory: directory(actor), notifications: notifications(actor) };
    },
    app: {
      notifications: {
        send: (message) => execute({ kind: 'app' }, 'sendNotification', { body: message }),
      },
    },
    get auth() {
      if (!options.sessionStore) {
        throw new ConfigurationError(
          'Signing people in needs a session store: pass sessionStore when creating the client.',
        );
      }
      auth ??= new Auth({
        appUrl: settings.appUrl,
        coreUrl: settings.coreUrl,
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        transport,
        sessionStore: options.sessionStore,
        tokenStore: options.tokenStore,
        scopes: options.scopes ?? ['openid', 'profile', 'email', 'offline_access'],
        redirectPath: options.redirectPath ?? '/auth/callback',
        postLogoutPath: options.postLogoutPath ?? '/',
        sessionSeconds: options.sessionSeconds,
      });
      return auth;
    },
    links: {
      profile: pageOf('/profile'),
      security: pageOf('/security'),
      preferences: pageOf('/preferences'),
      connectedApps: pageOf('/connected-apps'),
      deleteAccount: pageOf('/delete-account'),
    },
    instance: {
      getBranding: () => instance.branding(transport.deadline()),
    },
  };
}
