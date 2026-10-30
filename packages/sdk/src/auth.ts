import * as client from 'openid-client';
import {
  createRemoteJWKSet,
  customFetch as joseFetch,
  jwtVerify,
  errors as joseErrors,
} from 'jose';
import { CoreUnavailableError, NotAuthenticatedError, SignInError } from './errors';
import {
  clearCookie,
  cookieName,
  localPath,
  newId,
  readCookies,
  setCookie,
  type Session,
  type SessionStore,
  type StoredRecord,
} from './session';
import type { TokenStore } from './tokens';
import type { Transport } from './transport';

const PENDING_SECONDS = 10 * 60;
const DEFAULT_SESSION_SECONDS = 30 * 24 * 60 * 60;
const BACK_CHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
/** How far an `iat` may be ahead of this clock before a logout token is refused. */
const SKEW_SECONDS = 60;

export type AuthOptions = {
  appUrl: string;
  coreUrl: string;
  clientId: string;
  clientSecret: string;
  transport: Transport;
  sessionStore: SessionStore;
  /** Where a refresh token is kept, so the app can call as the person it signed in (sdk §5.1). */
  tokenStore: TokenStore | undefined;
  /** What the app asks to see. `offline_access` is what lets it call core as the person later. */
  scopes: readonly string[];
  /** The app's callback path. */
  redirectPath: string;
  /** Where core sends the person after signing out; registered with core. */
  postLogoutPath: string;
  /** How long a session lasts at most, in seconds. */
  sessionSeconds: number | undefined;
};

/** What to do next after a step of signing in or out: where to send the person, and the cookies to set. */
export type Step = { url: string; setCookies: string[] };

/**
 * Signing people in through core with `openid-client`, and ending sessions (sdk §9). Framework-neutral: it takes a web
 * `Request` and returns data and `Set-Cookie` values. It keeps nothing itself: the state of a sign-in and the sessions are
 * records in the app's store.
 */
export class Auth {
  readonly #o: AuthOptions;
  readonly #secure: boolean;
  #config: Promise<client.Configuration> | undefined;

  constructor(options: AuthOptions) {
    this.#o = options;
    this.#secure = new URL(options.appUrl).protocol === 'https:';
  }

  /** The app's own callback address, which must be registered with core. */
  get redirectUri(): string {
    return new URL(this.#o.redirectPath, this.#o.appUrl).toString();
  }

  /** The address core sends the person to after signing out, which must be registered with core. */
  get postLogoutRedirectUri(): string {
    return new URL(this.#o.postLogoutPath, this.#o.appUrl).toString();
  }

  // ---- signing in ----------------------------------------------------------------

  /** Starts a sign-in: the address to send the person to, and the cookie that names what to remember. */
  async beginSignIn(options: { returnTo?: string } = {}): Promise<Step> {
    const config = await this.#configuration();
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri,
      scope: this.#o.scopes.join(' '),
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    const id = newId();
    await this.#o.sessionStore.set(
      id,
      { kind: 'pending', data: { verifier, state, nonce, returnTo: localPath(options.returnTo) } },
      this.#now() + PENDING_SECONDS * 1000,
    );
    return {
      url: url.toString(),
      setCookies: [
        setCookie(cookieName('signin', this.#secure), id, {
          secure: this.#secure,
          maxAgeSeconds: PENDING_SECONDS,
        }),
      ],
    };
  }

  /** Finishes a sign-in at the callback: checks what came back, and makes the session. */
  async completeSignIn(
    request: Request,
  ): Promise<{ session: Session; returnTo: string; setCookies: string[] }> {
    const pendingName = cookieName('signin', this.#secure);
    const pendingId = readCookies(request.headers.get('cookie'))[pendingName];
    const clearPending = clearCookie(pendingName, this.#secure);
    if (!pendingId) throw new SignInError('No sign-in is in progress.');
    const pending = await this.#o.sessionStore.get(pendingId);
    // A callback can be used once, whatever comes of it.
    await this.#o.sessionStore.delete(pendingId);
    if (!pending || pending.kind !== 'pending') throw new SignInError('That sign-in has run out.');

    const config = await this.#configuration();
    // Behind a proxy the request's own address may be an internal one; the callback is the app's public address.
    const given = new URL(request.url);
    const current = new URL(`${given.pathname}${given.search}`, this.#o.appUrl);
    let tokens;
    try {
      tokens = await client.authorizationCodeGrant(config, current, {
        pkceCodeVerifier: String(pending.data.verifier),
        expectedState: String(pending.data.state),
        expectedNonce: String(pending.data.nonce),
        idTokenExpected: true,
      });
    } catch (error) {
      throw this.#failure(error);
    }

    const claims = tokens.claims();
    const sub = claims?.sub;
    if (!claims || typeof sub !== 'string') throw new SignInError('Core gave no identity.');
    const sid = typeof claims.sid === 'string' ? claims.sid : undefined;
    const seconds = this.#o.sessionSeconds ?? DEFAULT_SESSION_SECONDS;
    const expiresAt = this.#now() + seconds * 1000;
    const scopes = (tokens.scope ?? '').split(' ').filter((scope) => scope !== '');
    const id = newId();
    await this.#o.sessionStore.set(
      id,
      {
        kind: 'session',
        sub,
        ...(sid ? { sid } : {}),
        data: { claims, scopes, idToken: tokens.id_token, expiresAt },
      },
      expiresAt,
    );
    await this.#keepRefreshToken(sub, tokens.refresh_token);

    return {
      session: sessionFrom(id, {
        kind: 'session',
        sub,
        ...(sid ? { sid } : {}),
        data: { claims, scopes, expiresAt },
      }).session,
      returnTo: localPath(String(pending.data.returnTo)),
      setCookies: [
        setCookie(cookieName('session', this.#secure), id, {
          secure: this.#secure,
          maxAgeSeconds: seconds,
        }),
        clearPending,
      ],
    };
  }

  // ---- the session -----------------------------------------------------------------

  /** The current session, or nothing. It makes no call to core: the session is the app's own. */
  async getSession(request: Request): Promise<Session | null> {
    return (await this.#find(request))?.session ?? null;
  }

  /** The current session, or `NotAuthenticatedError`. */
  async requireSession(request: Request): Promise<Session> {
    const session = await this.getSession(request);
    if (!session) throw new NotAuthenticatedError();
    return session;
  }

  /**
   * Ends the app's session and clears its cookie, and gives the address of core's sign-out, which ends the person's core
   * session too. It ends the app's session even if the person never returns from core.
   */
  async signOut(request: Request): Promise<Step> {
    const name = cookieName('session', this.#secure);
    const found = await this.#find(request);
    const cookies = [clearCookie(name, this.#secure)];
    if (!found) return { url: this.postLogoutRedirectUri, setCookies: cookies };
    await this.#o.sessionStore.delete(found.id);
    const config = await this.#configuration();
    const hint = found.record.data.idToken;
    if (!config.serverMetadata().end_session_endpoint || typeof hint !== 'string') {
      return { url: this.postLogoutRedirectUri, setCookies: cookies };
    }
    const url = client.buildEndSessionUrl(config, {
      id_token_hint: hint,
      post_logout_redirect_uri: this.postLogoutRedirectUri,
    });
    return { url: url.toString(), setCookies: cookies };
  }

  // ---- logout notices --------------------------------------------------------------

  /** Verifies a logout token from core and ends the sessions it names (sdk §9.1). */
  async handleBackChannelLogout(request: Request): Promise<Response> {
    const refuse = () =>
      new Response(JSON.stringify({ error: 'invalid_request' }), {
        status: 400,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    if (request.method !== 'POST') return refuse();
    let token: string | null;
    try {
      token = new URLSearchParams(await request.text()).get('logout_token');
    } catch {
      return refuse();
    }
    if (!token) return refuse();

    const verified = await this.#verifyLogoutToken(token).catch((error: unknown) => {
      // Core being unreachable is not a bad token: the notice is not retried, so say we could not tell.
      if (error instanceof CoreUnavailableError) throw error;
      return undefined;
    });
    if (!verified) return refuse();

    const store = this.#o.sessionStore;
    await store.set(
      `seen:${verified.jti}`,
      { kind: 'seen', data: {} },
      Math.max(verified.exp * 1000, this.#now()) + 1000,
    );
    await store.deleteMatching(
      verified.sid ? { sid: verified.sid } : { sub: verified.sub as string },
    );
    return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
  }

  async #verifyLogoutToken(token: string) {
    const config = await this.#configuration();
    const jwksUri = config.serverMetadata().jwks_uri;
    if (!jwksUri) return undefined;
    const keys = createRemoteJWKSet(new URL(jwksUri), {
      [joseFetch]: (url: string, init: RequestInit) =>
        this.#o.transport.send(url, init, {
          operation: 'jwks',
          safeToRepeat: true,
          deadline: this.#o.transport.deadline(),
        }),
    });
    let payload;
    try {
      ({ payload } = await jwtVerify(token, keys, {
        issuer: this.#o.coreUrl,
        audience: this.#o.clientId,
        typ: 'logout+jwt',
        currentDate: new Date(this.#now()),
        requiredClaims: ['iat', 'exp', 'jti'],
      }));
    } catch (error) {
      if (error instanceof CoreUnavailableError) throw error;
      if (error instanceof joseErrors.JOSEError) return undefined;
      // The key set could not be fetched.
      if (error instanceof Error && error.name === 'JWKSTimeout') {
        throw new CoreUnavailableError('Core’s keys could not be fetched.');
      }
      return undefined;
    }
    const now = Math.floor(this.#now() / 1000);
    if (typeof payload.iat !== 'number' || payload.iat > now + SKEW_SECONDS) return undefined;
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events || typeof events !== 'object' || !(BACK_CHANNEL_EVENT in events)) return undefined;
    if ('nonce' in payload) return undefined;
    const sub = typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : undefined;
    const sid = typeof payload.sid === 'string' && payload.sid !== '' ? payload.sid : undefined;
    if (!sub && !sid) return undefined;
    const jti = payload.jti as string;
    // A notice seen before is a replay.
    if (await this.#o.sessionStore.get(`seen:${jti}`)) return undefined;
    return { sub, sid, jti, exp: payload.exp as number };
  }

  // ---- inside ------------------------------------------------------------------------

  async #find(
    request: Request,
  ): Promise<{ id: string; record: StoredRecord; session: Session } | null> {
    const id = readCookies(request.headers.get('cookie'))[cookieName('session', this.#secure)];
    if (!id) return null;
    const record = await this.#o.sessionStore.get(id);
    if (!record || record.kind !== 'session') return null;
    const { session } = sessionFrom(id, record);
    // A store should not return an expired record; this does not trust it to.
    if (session.expiresAt <= this.#now()) return null;
    return { id, record, session };
  }

  /** The person's refresh token goes to the token store, so the app can call core as them (sdk §5.1). */
  async #keepRefreshToken(sub: string, refresh: string | undefined): Promise<void> {
    const store = this.#o.tokenStore;
    if (!store || !refresh) return;
    try {
      await store.write(sub, refresh, await store.read(sub));
    } catch {
      // The session works without it; a call as the person then asks them to sign in again.
    }
  }

  #now(): number {
    return this.#o.transport.environment.now();
  }

  #configuration(): Promise<client.Configuration> {
    this.#config ??= this.#discover().catch((error: unknown) => {
      this.#config = undefined;
      throw error;
    });
    return this.#config;
  }

  async #discover(): Promise<client.Configuration> {
    const transport = this.#o.transport;
    const send: client.CustomFetch = (url, options) =>
      transport.send(url, options as RequestInit, {
        operation: 'sign-in',
        safeToRepeat: options.method === 'GET',
        deadline: transport.deadline(),
      });
    const insecure = new URL(this.#o.coreUrl).protocol === 'http:';
    try {
      const config = await client.discovery(
        new URL(this.#o.coreUrl),
        this.#o.clientId,
        undefined,
        client.ClientSecretBasic(this.#o.clientSecret),
        {
          ...(insecure ? { execute: [client.allowInsecureRequests] } : {}),
          [client.customFetch]: send,
        },
      );
      config[client.customFetch] = send;
      return config;
    } catch (error) {
      throw this.#failure(error);
    }
  }

  /** What went wrong, as the family of errors says it: core unreachable, or a sign-in that did not check out. */
  #failure(error: unknown): Error {
    if (error instanceof CoreUnavailableError) return error;
    const cause = (error as { cause?: unknown } | undefined)?.cause;
    if (cause instanceof CoreUnavailableError) return cause;
    return new SignInError('Core did not accept the sign-in. Start again.', { cause: error });
  }
}

function sessionFrom(id: string, record: StoredRecord): { id: string; session: Session } {
  const data = record.data as {
    claims?: Record<string, unknown>;
    scopes?: string[];
    expiresAt?: number;
  };
  const claims = data.claims ?? {};
  const roles = Array.isArray(claims.roles)
    ? (claims.roles as unknown[]).filter((role): role is string => typeof role === 'string')
    : [];
  return {
    id,
    session: {
      sub: String(record.sub),
      sid: record.sid,
      claims,
      scopes: data.scopes ?? [],
      roles,
      expiresAt: Number(data.expiresAt ?? 0),
    },
  };
}
