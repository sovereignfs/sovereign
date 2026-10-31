import { CoreApiError, CoreUnavailableError, SessionEndedError } from './errors';
import { secondsOf, type Deadline, type Transport } from './transport';

/**
 * What an app gives the SDK to keep a person's refresh token (sdk §5.1). The SDK ships none, since the app owns its data.
 *
 * Core rotates a refresh token on every use and treats one used twice as stolen, so the store must not lose a rotation.
 */
export interface TokenStore {
  /** The person's refresh token, or nothing when they have none. */
  read(sub: string): Promise<string | undefined> | string | undefined;
  /**
   * Stores `next` in place of `previous`, atomically: it MUST NOT store when the stored token is no longer `previous`, as
   * with a database's conditional update. Resolves `true` when it stored `next`, and `false` (or rejects) when it did not.
   * `previous` is `undefined` for a person with no token yet.
   */
  write(sub: string, next: string, previous: string | undefined): Promise<boolean> | boolean;
  /**
   * Runs `work` while no other process holds the lock for this person. An app that runs more than one process MUST give
   * one: two processes sending the same refresh token are indistinguishable from theft (sdk §5.1).
   */
  lock?<T>(sub: string, work: () => Promise<T>): Promise<T>;
  /**
   * Forgets the person's refresh token. Optional: the SDK calls it when core says the person deleted their account (sdk §9.1), and
   * an app whose store has no such call deletes the token in its own handler.
   */
  delete?(sub: string): Promise<void> | void;
}

/** Who a call is made as: a person, or the app itself. */
export type ActorKey = { kind: 'person'; sub: string } | { kind: 'app' };

type Cached = { token: string; expiresAt: number };

/** A token is used until this long before it expires, so it never runs out in flight (sdk §5.2). */
const EARLY_MS = 30_000;

type TokenResponse = { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };

export type TokenManagerOptions = {
  transport: Transport;
  coreUrl: string;
  clientId: string;
  clientSecret: string;
  store: TokenStore | undefined;
};

const keyOf = (actor: ActorKey) => (actor.kind === 'person' ? `person:${actor.sub}` : 'app');

/**
 * Gets, caches and refreshes the tokens an app uses to call core, so an app never handles an access token (sdk §5). Access
 * tokens live in memory only, until 30 seconds before they expire. A person's refresh token is rotated by core on every
 * use, so refreshes run one at a time for each person, the new refresh token is stored before the access token is used,
 * and a refresh is never sent again once it was sent.
 */
export class TokenManager {
  readonly #options: TokenManagerOptions;
  readonly #cache = new Map<string, Cached>();
  readonly #flights = new Map<string, Promise<string>>();
  /** Refresh tokens that core has probably rotated away, by person: sending one again would look like theft. */
  readonly #lost = new Map<string, string>();
  #endpoint: Promise<string> | undefined;

  constructor(options: TokenManagerOptions) {
    this.#options = options;
  }

  /** An access token for the Core API for this actor, from the cache when it is good. */
  token(actor: ActorKey, deadline: Deadline): Promise<string> {
    const key = keyOf(actor);
    const cached = this.#cache.get(key);
    if (cached && cached.expiresAt - EARLY_MS > this.#options.transport.environment.now()) {
      return Promise.resolve(cached.token);
    }
    const running = this.#flights.get(key);
    if (running) return running;
    const flight = (
      actor.kind === 'person' ? this.#refresh(actor.sub, deadline) : this.#appToken(deadline)
    ).finally(() => this.#flights.delete(key));
    this.#flights.set(key, flight);
    return flight;
  }

  /** Forgets the cached token of an actor, after core said it is no good. */
  discard(actor: ActorKey): void {
    this.#cache.delete(keyOf(actor));
  }

  /** The address of core's token endpoint, from its discovery document, asked for once. */
  #tokenEndpoint(deadline: Deadline): Promise<string> {
    this.#endpoint ??= this.#discover(deadline).catch((error: unknown) => {
      this.#endpoint = undefined;
      throw error;
    });
    return this.#endpoint;
  }

  async #discover(deadline: Deadline): Promise<string> {
    const reply = await this.#options.transport.send(
      `${this.#options.coreUrl}/.well-known/openid-configuration`,
      { method: 'GET', headers: { accept: 'application/json' } },
      { operation: 'discovery', safeToRepeat: true, deadline },
    );
    if (!reply.ok) throw new CoreUnavailableError(`Core answered ${reply.status}.`);
    const document = (await reply.json().catch(() => undefined)) as
      { token_endpoint?: unknown } | undefined;
    if (typeof document?.token_endpoint !== 'string') {
      throw new CoreUnavailableError('Core published no token endpoint.');
    }
    return document.token_endpoint;
  }

  #request(body: Record<string, string>, endpoint: string, deadline: Deadline, safe: boolean) {
    const { clientId, clientSecret, coreUrl, transport } = this.#options;
    const basic = btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`);
    return transport.send(
      endpoint,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({ ...body, resource: `${coreUrl}/api/v1` }).toString(),
      },
      { operation: 'token', safeToRepeat: safe, deadline },
    );
  }

  // ---- a person ----------------------------------------------------------------

  #refresh(sub: string, deadline: Deadline): Promise<string> {
    const store = this.#options.store;
    if (!store) {
      return Promise.reject(
        new SessionEndedError('No token store was given, so there is no refresh token to use.'),
      );
    }
    const work = () => this.#refreshOnce(store, sub, deadline);
    return store.lock ? store.lock(sub, work) : work();
  }

  async #refreshOnce(store: TokenStore, sub: string, deadline: Deadline): Promise<string> {
    // Read now, under the lock if there is one: another process may have rotated the token since this one last looked.
    const previous = await store.read(sub);
    if (!previous)
      throw new SessionEndedError('This person has no refresh token. They must sign in again.');
    if (this.#lost.get(sub) === previous) {
      throw new SessionEndedError(
        'This person’s session was lost in a renewal. They must sign in again.',
      );
    }
    const endpoint = await this.#tokenEndpoint(deadline);

    let reply: Response;
    try {
      // Sent once. If the answer is lost core may have rotated, and sending the old token again would look like theft.
      reply = await this.#request(
        { grant_type: 'refresh_token', refresh_token: previous },
        endpoint,
        deadline,
        false,
      );
    } catch (error) {
      // Core was not reached, or it answered with a failure: nothing is known to have changed, so the token is kept.
      if (
        error instanceof CoreUnavailableError &&
        (!error.requestSent || error.status !== undefined)
      ) {
        throw error;
      }
      this.#lost.set(sub, previous);
      throw new SessionEndedError(
        'Core did not answer the request to renew this person’s session, so it may have been renewed. They must sign in again.',
      );
    }

    if (!reply.ok) throw await refusal(reply, true);
    const answer = (await reply.json().catch(() => undefined)) as TokenResponse | undefined;
    const access = answer?.access_token;
    const lifetime = Number(answer?.expires_in);
    if (typeof access !== 'string' || !Number.isFinite(lifetime)) {
      throw new SessionEndedError(
        'Core’s answer to a renewal could not be read. They must sign in again.',
      );
    }
    const next = typeof answer?.refresh_token === 'string' ? answer.refresh_token : previous;
    if (next !== previous) {
      const stored = await (async () => store.write(sub, next, previous))().then(
        (result) => result === true,
        () => false,
      );
      // Core has rotated and the new token is not kept: the old one is dead and the new one is lost.
      if (!stored) {
        this.#lost.set(sub, previous);
        throw new SessionEndedError(
          'The renewed token could not be stored. They must sign in again.',
        );
      }
    }
    this.#cache.set(keyOf({ kind: 'person', sub }), {
      token: access,
      expiresAt: this.#options.transport.environment.now() + lifetime * 1000,
    });
    return access;
  }

  // ---- the app -----------------------------------------------------------------

  async #appToken(deadline: Deadline): Promise<string> {
    const endpoint = await this.#tokenEndpoint(deadline);
    // A new app token is simply asked for, so asking again is safe.
    const reply = await this.#request(
      { grant_type: 'client_credentials' },
      endpoint,
      deadline,
      true,
    );
    if (!reply.ok) throw await refusal(reply, false);
    const answer = (await reply.json().catch(() => undefined)) as TokenResponse | undefined;
    const access = answer?.access_token;
    const lifetime = Number(answer?.expires_in);
    if (typeof access !== 'string' || !Number.isFinite(lifetime)) {
      throw new CoreUnavailableError(
        'Core’s answer to a request for an app token could not be read.',
      );
    }
    this.#cache.set('app', {
      token: access,
      expiresAt: this.#options.transport.environment.now() + lifetime * 1000,
    });
    return access;
  }
}

/**
 * What a refusal at the token endpoint means. For a person, `invalid_grant` is a token that is dead (they sign in again);
 * anything else is core saying the app is wrong (a bad secret, a missing grant), which is the app's to fix.
 */
async function refusal(reply: Response, person: boolean): Promise<Error> {
  let code = 'unknown';
  let message = `Core answered ${reply.status}.`;
  try {
    const body = (await reply.json()) as { error?: unknown; error_description?: unknown };
    if (typeof body.error === 'string') code = body.error;
    if (typeof body.error_description === 'string') message = body.error_description;
  } catch {
    // Not an answer core gives.
  }
  if (person && code === 'invalid_grant') {
    return new SessionEndedError(
      'This person’s session cannot be renewed. They must sign in again.',
    );
  }
  const retryAfter = secondsOf(reply.headers.get('retry-after'));
  return new CoreApiError(reply.status, code, message, retryAfter > 0 ? retryAfter : undefined);
}
