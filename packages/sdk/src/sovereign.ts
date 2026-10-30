import {
  CoreApiError as ApiClientError,
  createCoreClient,
  operations,
  type InstanceBranding,
  type Operations,
} from '@sovereignfs/api-client';
import { CoreApiError, ConfigurationError, SessionEndedError } from './errors';
import { Instance } from './instance';
import { readSettings, type SettingsSource } from './settings';
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

/** What an app can do as a person. */
export interface PersonClient {
  readonly directory: DirectoryApi;
}

/** What an app can do as itself, with no person. Nothing yet: Phase 2's capabilities are added here (sdk §8). */
export type AppClient = Record<never, never>;

/** What anyone can ask, with no token. */
export interface InstanceApi {
  getBranding(): Promise<InstanceBranding>;
}

export interface Sovereign {
  /** Calls made as this person, with their token. Needs a token store. */
  as(person: Person): PersonClient;
  /** Calls made as the app itself. It never holds a person's token. */
  readonly app: AppClient;
  /** Public calls. */
  readonly instance: InstanceApi;
}

export type SovereignOptions = SettingsSource & {
  /** Where a person's refresh token is kept (sdk §5.1). Needed to call as a person. */
  tokenStore?: TokenStore;
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
      return { directory: directory({ kind: 'person', sub: person.sub }) };
    },
    app: {},
    instance: {
      getBranding: () => instance.branding(transport.deadline()),
    },
  };
}
