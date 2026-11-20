import * as client from 'openid-client';
import { createRemoteJWKSet, customFetch as joseFetch } from 'jose';
import { CoreUnavailableError, NotAuthenticatedError, SignInError } from './errors';
import { ExportWriter } from '@sovereignfs/export';
import {
  ACCOUNT_DELETED_EVENT,
  BACK_CHANNEL_EVENT,
  checkNotice,
  EXPORT_REQUESTED_EVENT,
} from './notices';
import {
  clearCookie,
  cookieName,
  localPath,
  newId,
  personFromClaims,
  readCookies,
  rolesFromClaims,
  setCookie,
  type User,
  type Session,
  type SessionStore,
  type StoredRecord,
} from './session';
import type { TokenStore } from './tokens';
import type { Transport } from './transport';

/**
 * How long a sign-in that was begun waits for its callback: an hour. Someone an app sends to core may create an account, verify their
 * address or reset their password on the way, and core carries the app's request through each (core-app §3.6.1); its emailed links
 * last an hour, so the app waits as long. The authorization code itself is still core's to time, and is good for minutes.
 */
const PENDING_SECONDS = 60 * 60;
const DEFAULT_SESSION_SECONDS = 30 * 24 * 60 * 60;

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
  /** How often a session is checked against core, in seconds, or never when unset (sdk §9.7). */
  checkEverySeconds: number | undefined;
};

/** How a sign-in is asked for (sdk §9.6). */
export type SignInOptions = {
  /** A path on the app to come back to. */
  returnTo?: string;
  /** `login`: sign in again at core even with a session there. `none`: show nothing, and fail if that is not possible. */
  prompt?: 'login' | 'none';
  /** The oldest sign-in at core the app accepts, in seconds; checked against the ID token's `auth_time`. */
  maxAgeSeconds?: number;
};

/** What to do next after a step of signing in or out: where to send the person, and the cookies to set. */
export type Step = { url: string; setCookies: string[] };

/** Who signed in, for an app that keeps its own sessions (sdk §9.8). The refresh token is already in the token store. */
export type SignedIn = {
  sub: string;
  /** The core session this sign-in belongs to, when core gave one. */
  sid: string | undefined;
  claims: Record<string, unknown>;
  /** Who the person is, from the claims (sdk §9.9); `id` is `sub` until the app gives the person an id of its own. */
  user: User;
  scopes: string[];
  /** Kept by the caller for signing out (`endSessionUrl`). */
  idToken: string | undefined;
  /** Where the person was headed, a path on the app. */
  returnTo: string;
  /** Clears the pending sign-in's cookie. */
  setCookies: string[];
};

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

  /** A `Set-Cookie` value that clears the session cookie. */
  get endSessionCookie(): string {
    return clearCookie(cookieName('session', this.#secure), this.#secure);
  }

  /** The address core sends the person to after signing out, which must be registered with core. */
  get postLogoutRedirectUri(): string {
    return new URL(this.#o.postLogoutPath, this.#o.appUrl).toString();
  }

  // ---- signing in ----------------------------------------------------------------

  /**
   * Starts a sign-in: the address to send the person to, and the cookie that names what to remember.
   *
   * `prompt: 'login'` asks core to have the person sign in again even with a session there; `maxAgeSeconds` asks for a sign-in
   * no older than that, which core gives by asking again when its session is older, and which the callback checks against
   * the ID token's `auth_time` (sdk §9.6). `prompt: 'none'` asks core not to show anything: the callback then fails with a
   * `SignInError` when the person would have had to sign in.
   */
  async beginSignIn(options: SignInOptions = {}): Promise<Step> {
    const maxAge = options.maxAgeSeconds;
    if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0)) {
      throw new TypeError('maxAgeSeconds must be a whole number of seconds, 0 or more.');
    }
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
      ...(options.prompt ? { prompt: options.prompt } : {}),
      ...(maxAge !== undefined ? { max_age: String(maxAge) } : {}),
    });
    const id = newId();
    await this.#o.sessionStore.set(
      id,
      {
        kind: 'pending',
        data: {
          verifier,
          state,
          nonce,
          returnTo: localPath(options.returnTo),
          ...(maxAge !== undefined ? { maxAge } : {}),
        },
      },
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

  /**
   * Finishes a sign-in at the callback for an app that keeps its own sessions (sdk §9.8): checks what came back as §9.1 does, keeps
   * the refresh token in the token store (§5.1), and says who signed in. It makes no session of the SDK's; the cookie it sets only
   * clears the pending sign-in. A sign-in that asked to show nothing and found the person signed out at core throws a `SignInError`
   * whose reason is `login_required`, so the caller ends its own session (§9.7).
   */
  async finishSignIn(request: Request): Promise<SignedIn> {
    const pendingName = cookieName('signin', this.#secure);
    const pendingId = readCookies(request.headers.get('cookie'))[pendingName];
    const clearPending = clearCookie(pendingName, this.#secure);
    if (!pendingId) throw new SignInError('No sign-in is in progress.');
    const pending = await this.#o.sessionStore.get(pendingId);
    // A callback can be used once, whatever comes of it.
    await this.#o.sessionStore.delete(pendingId);
    if (!pending || pending.kind !== 'pending') throw new SignInError('That sign-in has run out.');
    const returnTo = localPath(String(pending.data.returnTo));

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
        // A sign-in asked to be recent is held to it: the ID token's `auth_time` must be within the age asked for.
        ...(typeof pending.data.maxAge === 'number' ? { maxAge: pending.data.maxAge } : {}),
      });
    } catch (error) {
      // Core said the person must sign in, to a sign-in that asked it to show nothing: their core session is over (sdk §9.7).
      if ((error as { error?: unknown } | undefined)?.error === 'login_required') {
        throw new SignInError('The person is no longer signed in at core.', {
          cause: error,
          reason: 'login_required',
          returnTo,
        });
      }
      throw this.#failure(error);
    }

    const claims = tokens.claims();
    const sub = claims?.sub;
    if (!claims || typeof sub !== 'string') throw new SignInError('Core gave no identity.');
    const sid = typeof claims.sid === 'string' ? claims.sid : undefined;
    const scopes = (tokens.scope ?? '').split(' ').filter((scope) => scope !== '');
    await this.#keepRefreshToken(sub, tokens.refresh_token);
    return {
      sub,
      sid,
      claims,
      user: personFromClaims(claims),
      scopes,
      idToken: tokens.id_token,
      returnTo,
      setCookies: [clearPending],
    };
  }

  /** Finishes a sign-in at the callback: `finishSignIn`, and the SDK's own session made from it (§9.1). */
  async completeSignIn(
    request: Request,
  ): Promise<{ session: Session; returnTo: string; setCookies: string[] }> {
    let signedIn: SignedIn;
    try {
      signedIn = await this.finishSignIn(request);
    } catch (error) {
      // The session this browser has here ends with the core session that ended (sdk §9.7).
      if (error instanceof SignInError && error.reason === 'login_required') {
        const ending = await this.#find(request);
        if (ending) await this.#o.sessionStore.delete(ending.id);
      }
      throw error;
    }
    const { sub, sid, claims, scopes, idToken, returnTo, setCookies } = signedIn;
    const seconds = this.#o.sessionSeconds ?? DEFAULT_SESSION_SECONDS;
    const expiresAt = this.#now() + seconds * 1000;
    // A check of this browser's session (sdk §9.7), or a sign-in again by the same person, renews the session in place: the same id,
    // and the same key secret, so what the browser keeps for the session still opens. Another person gets a session of their own.
    const existing = await this.#find(request);
    const renewing = existing?.session.sub === sub ? existing : undefined;
    if (existing && !renewing) await this.#o.sessionStore.delete(existing.id);
    const id = renewing?.id ?? newId();
    const keySecret = renewing?.record.data.keySecret;
    const checkedAt = this.#now();
    await this.#o.sessionStore.set(
      id,
      {
        kind: 'session',
        sub,
        ...(sid ? { sid } : {}),
        data: {
          claims,
          scopes,
          idToken,
          expiresAt,
          checkedAt,
          ...(typeof keySecret === 'string' ? { keySecret } : {}),
        },
      },
      expiresAt,
    );

    return {
      session: sessionFrom(id, {
        kind: 'session',
        sub,
        ...(sid ? { sid } : {}),
        data: { claims, scopes, expiresAt, checkedAt },
      }).session,
      returnTo,
      setCookies: [
        setCookie(cookieName('session', this.#secure), id, {
          secure: this.#secure,
          maxAgeSeconds: seconds,
        }),
        ...setCookies,
      ],
    };
  }

  /**
   * Core's sign-out for an ID token the caller kept (sdk §9.8): the address that ends the person's core session, or the app's own
   * post-logout address when core offers no end-session or there is no token. Core decides what signing out of the app ends
   * (core-app §3.6.5).
   */
  async endSessionUrl(idToken: string | undefined): Promise<string> {
    const config = await this.#configuration();
    if (!config.serverMetadata().end_session_endpoint || typeof idToken !== 'string') {
      return this.postLogoutRedirectUri;
    }
    return client
      .buildEndSessionUrl(config, {
        id_token_hint: idToken,
        post_logout_redirect_uri: this.postLogoutRedirectUri,
      })
      .toString();
  }

  // ---- the session -----------------------------------------------------------------

  /** The current session, or nothing. It makes no call to core: the session is the app's own. */
  async getSession(request: Request): Promise<Session | null> {
    return (await this.#find(request))?.session ?? null;
  }

  /**
   * The session's half of what keeps the app key in the browser (RFC 0005 §5, sdk §9.2): 32 random bytes, made the first time a page
   * of this session asks and kept with the session, so they go when it ends, however it ends. `null` with no session. Only the app's
   * own pages are given it, through `/auth/key-secret`.
   */
  async keySecret(request: Request): Promise<{ sub: string; secret: string } | null> {
    const found = await this.#find(request);
    if (!found) return null;
    const kept = found.record.data.keySecret;
    if (typeof kept === 'string') return { sub: found.session.sub, secret: kept };
    const secret = newId();
    await this.#o.sessionStore.set(
      found.id,
      { ...found.record, data: { ...found.record.data, keySecret: secret } },
      found.session.expiresAt,
    );
    return { sub: found.session.sub, secret };
  }

  /**
   * Whether the person signed in at core within the last `seconds`, by the session's `authTime`. A session with no `authTime`
   * is not recent: core did not say when (sdk §9.6).
   */
  signedInWithin(session: Pick<Session, 'authTime'>, seconds: number): boolean {
    return session.authTime !== undefined && this.#now() - session.authTime <= seconds * 1000;
  }

  /**
   * Whether the session is due a check against core (sdk §9.7): the client checks every `checkEverySeconds`, and this one was last checked
   * longer ago, or never. Always false when the client does not check.
   */
  needsCheck(session: Pick<Session, 'checkedAt'>): boolean {
    const every = this.#o.checkEverySeconds;
    if (every === undefined) return false;
    return session.checkedAt === undefined || this.#now() - session.checkedAt > every * 1000;
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
    // A notice for the whole person (no `sid`) ends everything the app holds for them, so the app no longer calls core as them.
    // One core session's notice leaves the refresh token: it is the person's, and their other sessions in the app use it.
    if (!verified.sid) await this.#o.tokenStore?.delete?.(verified.sub as string);
    return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
  }

  /**
   * Handles core's account-deleted notice (sdk §9.1, core-app §4.5): the person deleted their account, and the app must delete what it
   * holds of them. The token is refused, `400` and `invalid_request`, by the rules of a logout token for its own type and event. For a
   * good one the SDK ends the person's sessions and forgets their stored refresh token (when the token store can), runs `handler`, and
   * answers `200` only after it has resolved. When the handler throws it answers `500` and says nothing of why, and core sends the
   * notice again, so the handler must be safe to run twice.
   */
  async handleAccountDeleted(
    request: Request,
    handler: (person: { readonly sub: string }) => Promise<void> | void,
  ): Promise<Response> {
    const reply = (status: number, error?: string) =>
      new Response(error ? JSON.stringify({ error }) : null, {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    if (request.method !== 'POST') return reply(400, 'invalid_request');
    let token: string | null;
    try {
      token = new URLSearchParams(await request.text()).get('account_deleted_token');
    } catch {
      return reply(400, 'invalid_request');
    }
    if (!token) return reply(400, 'invalid_request');

    const verified = await this.#verifyNotice(
      token,
      'account-deleted+jwt',
      ACCOUNT_DELETED_EVENT,
    ).catch((error: unknown) => {
      // Core being unreachable is not a bad token: say we could not tell, and core tries again.
      if (error instanceof CoreUnavailableError) throw error;
      return undefined;
    });
    if (!verified?.sub) return reply(400, 'invalid_request');

    const store = this.#o.sessionStore;
    await store.set(
      `seen:${verified.jti}`,
      { kind: 'seen', data: {} },
      Math.max(verified.exp * 1000, this.#now()) + 1000,
    );
    await store.deleteMatching({ sub: verified.sub });
    await this.#o.tokenStore?.delete?.(verified.sub);
    try {
      await handler({ sub: verified.sub });
    } catch {
      return reply(500, 'server_error');
    }
    return reply(200);
  }

  /**
   * Handles core's request for a person's part of their export (sdk §9.1, core-app §4.7.2). The token is refused, `400` and
   * `invalid_request`, by the rules of a logout token for its own type and event, and a replayed one too. For a good one the SDK answers
   * `200` at once with an export (`contracts/export.md`, `kind: "person"`, this app's `prefix` and the person's `sub`) written as
   * `handler` adds to it, and finishes it when `handler` resolves; when `handler` throws, the answer ends short, which core's check
   * refuses, so core lists the part as missing. Asking again changes nothing, so the handler need not guard against it. Nothing of
   * anyone but `sub` belongs in it, under `apps/<prefix>/`.
   */
  async handleExportRequest(
    request: Request,
    app: { readonly prefix: string; readonly version: string },
    handler: (part: { readonly sub: string; readonly writer: ExportWriter }) => Promise<void>,
  ): Promise<Response> {
    const reply = (status: number, error?: string) =>
      new Response(error ? JSON.stringify({ error }) : null, {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    if (request.method !== 'POST') return reply(400, 'invalid_request');
    let token: string | null;
    try {
      token = new URLSearchParams(await request.text()).get('export_request_token');
    } catch {
      return reply(400, 'invalid_request');
    }
    if (!token) return reply(400, 'invalid_request');
    const verified = await this.#verifyNotice(
      token,
      'export-request+jwt',
      EXPORT_REQUESTED_EVENT,
    ).catch((error: unknown) => {
      if (error instanceof CoreUnavailableError) throw error;
      return undefined;
    });
    if (!verified?.sub) return reply(400, 'invalid_request');
    await this.#o.sessionStore.set(
      `seen:${verified.jti}`,
      { kind: 'seen', data: {} },
      Math.max(verified.exp * 1000, this.#now()) + 1000,
    );
    const sub = verified.sub;
    const writer = new ExportWriter({
      head: {
        format: 1,
        kind: 'person',
        producer: { name: app.prefix, version: app.version },
        app: app.prefix,
        sub,
        takenAt: new Date(this.#now()).toISOString(),
      },
    });
    writer.addPart({ name: app.prefix, status: 'complete', version: app.version });
    void (async () => {
      try {
        await handler({ sub, writer });
        await writer.finish();
      } catch (error) {
        await writer.abort(error);
      }
    })();
    return new Response(writer.readable, {
      status: 200,
      headers: { 'content-type': 'application/x-tar', 'cache-control': 'no-store' },
    });
  }

  async #verifyLogoutToken(token: string) {
    return this.#verifyNotice(token, 'logout+jwt', BACK_CHANNEL_EVENT);
  }

  /** Checks a notice core signed (a logout token or an account-deleted token): the rules of `checkNotice`, then that it was not seen before. */
  async #verifyNotice(token: string, typ: string, event: string) {
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
    const verified = await checkNotice(token, {
      typ,
      event,
      issuer: this.#o.coreUrl,
      audience: this.#o.clientId,
      keys,
      now: this.#now(),
    });
    // A notice seen before is a replay.
    if (!verified || (await this.#o.sessionStore.get(`seen:${verified.jti}`))) return undefined;
    return verified;
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
    checkedAt?: number;
  };
  const claims = data.claims ?? {};
  const roles = rolesFromClaims(claims);
  return {
    id,
    session: {
      sub: String(record.sub),
      sid: record.sid,
      user: personFromClaims({ ...claims, sub: String(record.sub) }),
      claims,
      scopes: data.scopes ?? [],
      roles,
      ...(typeof claims.auth_time === 'number' ? { authTime: claims.auth_time * 1000 } : {}),
      ...(typeof data.checkedAt === 'number' ? { checkedAt: data.checkedAt } : {}),
      expiresAt: Number(data.expiresAt ?? 0),
    },
  };
}
