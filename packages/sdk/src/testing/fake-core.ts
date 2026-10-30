import type { DirectoryUser, DirectoryUserStatus, InstanceBranding } from '@sovereignfs/api-client';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import type { SessionStore, StoredRecord } from '../session';

/** A person the fake core knows. */
export type FakePerson = {
  sub: string;
  name?: string;
  picture?: string | null;
  /** False for a deactivated account (the Directory returns it with `active: false`). */
  active?: boolean;
};

/**
 * How the fake core can be told to fail (sdk §11), one for each way §6 lists:
 *
 * - `down`: the connection is refused, as with core stopped. Nothing reaches the fake.
 * - `lost-answer`: the request is handled and its answer never arrives. For a refresh, core has rotated the token.
 * - `timeout`: the answer takes longer than any timeout.
 * - `status`: core answers with this failure status (5xx is unavailable, 429 sets `Retry-After`).
 */
export type Failure =
  | { kind: 'down' }
  | { kind: 'lost-answer' }
  | { kind: 'timeout' }
  | { kind: 'status'; status: number; retryAfter?: number };

/** The ways a logout token can be wrong, each of which an app must refuse. */
export type WrongLogoutToken =
  | 'signature'
  | 'issuer'
  | 'audience'
  | 'expired'
  | 'future'
  | 'event'
  | 'nonce'
  | 'type'
  | 'no-subject'
  | 'no-jti';

/** Which requests a failure applies to. */
export type Target = 'any' | 'token' | 'api' | 'instance' | 'discovery';

export type FakeCoreOptions = {
  /** The instance's address. */
  url?: string;
  /** The app's credentials in this core. */
  clientId?: string;
  clientSecret?: string;
  /** The clock, in milliseconds. Defaults to the real one. */
  now?: () => number;
  /** How long an access token lives, in seconds. 900, as core's does. */
  accessTokenSeconds?: number;
  /**
   * What the instance document says is served. `undefined` is a core that publishes no `api` (an old core), and it serves
   * the Directory only. Defaults to a core that serves the Directory.
   */
  api?: { versions: string[]; capabilities: string[] } | undefined;
  /** Whether the app may ask for a token for itself. On by default. */
  appTokens?: boolean;
  instance?: { name?: string };
};

/** A notification an app sent through the fake core. */
export type FakeNotification = {
  id: string;
  to: string;
  title: string;
  body?: string;
  url?: string;
  category?: string;
  createdAt: number;
  readAt: number | null;
  dismissed: boolean;
};

/** An email an app sent through the fake core. Whether it was delivered is never said, here or in core. */
export type FakeEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  link?: string;
  key?: string;
  sentAt: number;
};

/** One request the fake received, with nothing secret in it. `status` is 0 when it was never answered. */
export type Received = { method: string; path: string; status: number };

export type FakeCore = {
  /** The instance's address, to give `createSovereign` as `coreUrl`. */
  readonly url: string;
  /** The app's credentials in this core. */
  readonly credentials: { clientId: string; clientSecret: string };
  /** Answers like core does. Give it to `createSovereign({ fetch })`: no server, no port. */
  readonly fetch: typeof fetch;
  /** What apps have sent through this core, in order, whether or not it was read or dismissed. */
  readonly notificationsSent: readonly FakeNotification[];
  /** The emails apps sent to people the fake has, in order. A send to anyone else is accepted and dropped, as core does. */
  readonly emailsSent: readonly FakeEmail[];
  /** Adds a person to the Directory. */
  addPerson(person: FakePerson): void;
  /** Signs a person in, and returns the refresh token an app would have stored for them. */
  signIn(sub: string): string;
  /** Makes the next requests fail. `times` limits how many (default: until `heal`). */
  fail(failure: Failure, options?: { target?: Target; times?: number }): void;
  /** Ends every failure. */
  heal(): void;
  /**
   * The person agrees at core's sign-in page: given the address `beginSignIn` returned, this is the address core sends the
   * browser back to, with the code and `state`. It checks the request as core does (PKCE `S256`, a registered redirect).
   */
  authorize(authorizationUrl: string, sub: string, options?: { roles?: string[] }): string;
  /** The core session id (`sid`) of the person's latest sign-in. */
  sessionIdOf(sub: string): string | undefined;
  /**
   * A signed logout token, as core sends to an app's back-channel address when a session ends (core-app §3.6.5). `wrong` makes
   * one that is wrong in one way, for testing that an app refuses it.
   */
  logoutToken(
    who: { sub?: string; sid?: string },
    options?: { wrong?: WrongLogoutToken },
  ): Promise<string>;
  /** Ends a person's tokens, as core does when their sessions end: the next use of any is refused. */
  revoke(sub: string): void;
  /** Ends every access token but keeps the refresh tokens, so the next call must refresh. */
  expireAccessTokens(): void;
  /** What happened. */
  readonly seen: {
    /** Every request, in order. */
    readonly requests: readonly Received[];
    /** How many times a refresh token was exchanged. */
    readonly refreshes: number;
    /** How many times an app token was asked for. */
    readonly appTokens: number;
    /** How many times an already-used refresh token was sent, which core treats as theft and answers by ending the person's tokens. */
    readonly reused: number;
  };
};

type Person = Required<Pick<FakePerson, 'sub' | 'name'>> & Pick<FakePerson, 'picture' | 'active'>;
type Access = { kind: 'person'; sub: string } | { kind: 'app' };

/** The PKCE `S256` challenge for a verifier. */
async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const random = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const problem = (
  status: number,
  error: string,
  message: string,
  headers: Record<string, string> = {},
) => json({ error, message }, status, headers);

/**
 * A core for an app's tests that needs no server (sdk §11). It answers the contract's operations and the token endpoint
 * the way core does, including rotating a refresh token on every use and ending a person's tokens when one is used twice,
 * and it can be told to fail in each way the specification lists. The SDK's own tests check its answers against the
 * contract.
 */
export function createFakeCore(options: FakeCoreOptions = {}): FakeCore {
  const url = new URL(options.url ?? 'https://core.test').origin;
  const credentials = {
    clientId: options.clientId ?? 'fake-app',
    clientSecret: options.clientSecret ?? 'fake-secret',
  };
  const now = options.now ?? (() => Date.now());
  const lifetime = options.accessTokenSeconds ?? 900;
  const api =
    'api' in options
      ? options.api
      : { versions: ['v1'], capabilities: ['directory', 'notifications', 'email'] };
  const appTokens = options.appTokens ?? true;

  const people = new Map<string, Person>();
  /** Codes core has given for a sign-in, and the core sessions those made. */
  const codes = new Map<
    string,
    {
      sub: string;
      sid: string;
      nonce: string | null;
      challenge: string;
      redirectUri: string;
      scope: string;
      roles: string[];
      used: boolean;
    }
  >();
  const sessionOf = new Map<string, string>();
  let signing: Promise<{ privateKey: CryptoKey; publicJwk: JWK }> | undefined;
  const keys = () =>
    (signing ??= generateKeyPair('EdDSA', { extractable: true }).then(async (pair) => ({
      privateKey: pair.privateKey,
      publicJwk: { ...(await exportJWK(pair.publicKey)), kid: 'fake-1', alg: 'EdDSA', use: 'sig' },
    })));
  /** Refresh tokens: whose they are and whether they were used. */
  const refreshTokens = new Map<string, { sub: string; used: boolean }>();
  const accessTokens = new Map<string, Access & { expiresAt: number }>();
  const failures: { failure: Failure; target: Target; times: number }[] = [];
  const requests: Received[] = [];
  const seen = { refreshes: 0, appTokens: 0, reused: 0 };

  const targetOf = (path: string): Target =>
    path === '/api/auth/oauth2/token'
      ? 'token'
      : path === '/.well-known/openid-configuration'
        ? 'discovery'
        : path === '/.well-known/sovereign-instance'
          ? 'instance'
          : 'api';

  const takeFailure = (target: Target): Failure | undefined => {
    const index = failures.findIndex((f) => f.target === 'any' || f.target === target);
    const found = failures[index];
    if (!found) return undefined;
    found.times -= 1;
    if (found.times <= 0) failures.splice(index, 1);
    return found.failure;
  };

  const down = (): never => {
    throw new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
  };
  const hang = (signal: AbortSignal | null | undefined): Promise<never> =>
    new Promise((_resolve, reject) => {
      const stop = () =>
        reject(signal?.reason ?? new DOMException('The operation was aborted.', 'TimeoutError'));
      if (!signal) return;
      if (signal.aborted) stop();
      else signal.addEventListener('abort', stop, { once: true });
    });

  const issueAccess = (access: Access) => {
    const token = random('at');
    accessTokens.set(token, { ...access, expiresAt: now() + lifetime * 1000 });
    return token;
  };

  const tokenEndpoint = async (
    request: Request,
    failure: Failure | undefined,
    signal: AbortSignal | null | undefined,
  ): Promise<Response> => {
    // HTTP Basic, with each part form-encoded and so decoded first (RFC 6749 §2.3.1), as core does.
    const given = request.headers.get('authorization') ?? '';
    const decoded = given.startsWith('Basic ') ? atob(given.slice(6)) : '';
    const colon = decoded.indexOf(':');
    const decode = (part: string) => {
      try {
        return decodeURIComponent(part.replace(/\+/g, ' '));
      } catch {
        return part;
      }
    };
    if (
      colon < 0 ||
      decode(decoded.slice(0, colon)) !== credentials.clientId ||
      decode(decoded.slice(colon + 1)) !== credentials.clientSecret
    ) {
      return json({ error: 'invalid_client', error_description: 'the app is not recognised' }, 401);
    }
    const form = new URLSearchParams(await request.text());
    const grant = form.get('grant_type');
    let answer: Response;
    if (grant === 'authorization_code') {
      const record = codes.get(form.get('code') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      if (
        !record ||
        record.used ||
        form.get('redirect_uri') !== record.redirectUri ||
        (await challengeOf(verifier)) !== record.challenge
      ) {
        if (record) record.used = true;
        answer = json({ error: 'invalid_grant', error_description: 'the code is not valid' }, 400);
      } else {
        record.used = true;
        const person = people.get(record.sub);
        const issued = Math.floor(now() / 1000);
        const idToken = await new SignJWT({
          ...(record.nonce ? { nonce: record.nonce } : {}),
          sid: record.sid,
          name: person?.name ?? record.sub,
          ...(record.scope.split(' ').includes('roles') ? { roles: record.roles } : {}),
        })
          .setProtectedHeader({ alg: 'EdDSA', kid: 'fake-1' })
          .setIssuer(url)
          .setAudience(credentials.clientId)
          .setSubject(record.sub)
          .setIssuedAt(issued)
          .setExpirationTime(issued + 3600)
          .sign((await keys()).privateKey);
        let refresh: string | undefined;
        if (record.scope.split(' ').includes('offline_access')) {
          refresh = random('rt');
          refreshTokens.set(refresh, { sub: record.sub, used: false });
        }
        answer = json({
          token_type: 'Bearer',
          access_token: issueAccess({ kind: 'person', sub: record.sub }),
          id_token: idToken,
          ...(refresh ? { refresh_token: refresh } : {}),
          expires_in: lifetime,
          scope: record.scope,
        });
      }
    } else if (grant === 'refresh_token') {
      const presented = form.get('refresh_token') ?? '';
      const known = refreshTokens.get(presented);
      if (!known) {
        answer = json({ error: 'invalid_grant', error_description: 'the token is not valid' }, 400);
      } else if (known.used) {
        // A token used twice is stolen: everything this app holds for the person goes.
        seen.reused += 1;
        for (const [token, other] of refreshTokens)
          if (other.sub === known.sub) refreshTokens.delete(token);
        for (const [token, other] of accessTokens)
          if (other.kind === 'person' && other.sub === known.sub) accessTokens.delete(token);
        answer = json(
          { error: 'invalid_grant', error_description: 'the token was already used' },
          400,
        );
      } else {
        known.used = true;
        seen.refreshes += 1;
        const next = random('rt');
        refreshTokens.set(next, { sub: known.sub, used: false });
        answer = json({
          token_type: 'Bearer',
          access_token: issueAccess({ kind: 'person', sub: known.sub }),
          refresh_token: next,
          expires_in: lifetime,
          scope: 'directory notifications',
        });
      }
    } else if (grant === 'client_credentials' && appTokens) {
      seen.appTokens += 1;
      answer = json({
        token_type: 'Bearer',
        access_token: issueAccess({ kind: 'app' }),
        expires_in: lifetime,
      });
    } else {
      answer = json(
        { error: 'unsupported_grant_type', error_description: 'the grant is not offered' },
        400,
      );
    }
    // The request was handled. Whether the answer arrives is what `lost-answer` decides.
    if (failure?.kind === 'lost-answer') return hang(signal);
    return answer;
  };

  const bearer = (request: Request): (Access & { expiresAt: number }) | Response => {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const found = accessTokens.get(token);
    if (!found || found.expiresAt <= now()) {
      return problem(401, 'invalid_token', 'The token is missing, expired or revoked.', {
        'www-authenticate': 'Bearer error="invalid_token"',
      });
    }
    return found;
  };

  const user = (person: Person): DirectoryUser => ({
    sub: person.sub,
    name: person.name,
    picture: person.picture ?? null,
  });

  /** What apps sent, by the person it was sent to. A send to anyone who is not here is accepted and dropped, as core does. */
  const sent = new Map<string, FakeNotification>();
  const notificationJson = (n: FakeNotification) => ({
    id: n.id,
    title: n.title,
    body: n.body ?? null,
    url: n.url ?? null,
    category: n.category ?? 'info',
    createdAt: new Date(n.createdAt).toISOString(),
    readAt: n.readAt === null ? null : new Date(n.readAt).toISOString(),
    expiresAt: new Date(n.createdAt + 30 * 86_400_000).toISOString(),
  });

  const emails = new Map<string, FakeEmail>();
  const emailApi = async (request: Request): Promise<Response> => {
    const who = bearer(request);
    if (who instanceof Response) return who;
    if (who.kind !== 'app' || request.method !== 'POST') {
      return problem(403, 'insufficient_scope', 'Only an app acting for itself may send email.');
    }
    const body = (await request.json().catch(() => undefined)) as
      Record<string, unknown> | undefined;
    const text = (value: unknown, max: number) =>
      typeof value === 'string' && value.trim() !== '' && value.length <= max;
    if (
      !body ||
      !text(body.to, 255) ||
      !text(body.subject, 150) ||
      !text(body.body, 5000) ||
      (body.link !== undefined && typeof body.link !== 'string') ||
      (body.key !== undefined && !text(body.key, 100))
    ) {
      return problem(400, 'invalid_request', 'to, subject and body are required text.');
    }
    const to = body.to as string;
    const key = body.key as string | undefined;
    const same =
      key === undefined
        ? undefined
        : [...emails.values()].find(
            (email) => email.to === to && email.key === key && now() - email.sentAt < 86_400_000,
          );
    if (same) return json({ id: same.id }, 202);
    const id = random('m');
    if (people.has(to) && people.get(to)?.active !== false) {
      emails.set(id, {
        id,
        to,
        subject: body.subject as string,
        body: body.body as string,
        ...(typeof body.link === 'string' ? { link: body.link } : {}),
        ...(key === undefined ? {} : { key }),
        sentAt: now(),
      });
    }
    return json({ id }, 202);
  };

  const notificationsApi = async (request: Request, path: URL): Promise<Response> => {
    const who = bearer(request);
    if (who instanceof Response) return who;
    const sendPath = path.pathname === '/api/v1/notifications' && request.method === 'POST';
    if (sendPath) {
      if (who.kind !== 'app') {
        return problem(403, 'insufficient_scope', 'Only an app acting for itself may send.');
      }
      const body = (await request.json().catch(() => undefined)) as
        | { to?: unknown; title?: unknown; body?: unknown; url?: unknown; category?: unknown }
        | undefined;
      if (
        !body ||
        typeof body.to !== 'string' ||
        typeof body.title !== 'string' ||
        body.title === ''
      ) {
        return problem(400, 'invalid_request', 'to and title are required.');
      }
      const id = random('n');
      if (people.get(body.to)?.active !== false && people.has(body.to)) {
        sent.set(id, {
          id,
          to: body.to,
          title: body.title,
          ...(typeof body.body === 'string' ? { body: body.body } : {}),
          ...(typeof body.url === 'string' ? { url: body.url } : {}),
          ...(typeof body.category === 'string' ? { category: body.category } : {}),
          createdAt: now(),
          readAt: null,
          dismissed: false,
        });
      }
      return json({ id }, 202);
    }
    if (who.kind !== 'person') {
      return problem(
        403,
        'insufficient_scope',
        'The token does not carry the notifications scope.',
      );
    }
    const mine = () => [...sent.values()].filter((n) => n.to === who.sub && !n.dismissed);
    if (path.pathname === '/api/v1/notifications' && request.method === 'GET') {
      const unread = path.searchParams.get('unread') === 'true';
      const limit = Number(path.searchParams.get('limit') ?? 50);
      const found = mine()
        .filter((n) => !unread || n.readAt === null)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, Number.isInteger(limit) && limit > 0 ? limit : 50);
      return json({ notifications: found.map(notificationJson) });
    }
    if (request.method === 'POST' && path.pathname === '/api/v1/notifications/read-all') {
      const all = mine().filter((n) => n.readAt === null);
      for (const n of all) n.readAt = now();
      return json({ count: all.length });
    }
    if (request.method === 'POST' && path.pathname === '/api/v1/notifications/dismiss-all') {
      const all = mine();
      for (const n of all) n.dismissed = true;
      return json({ count: all.length });
    }
    const one = /^\/api\/v1\/notifications\/([^/]+)\/(read|dismiss)$/.exec(path.pathname);
    if (one && request.method === 'POST') {
      const found = mine().find((n) => n.id === one[1]);
      if (!found) return problem(404, 'not_found', 'There is no such notification.');
      if (one[2] === 'read') found.readAt ??= now();
      else found.dismissed = true;
      return json(notificationJson(found));
    }
    return problem(404, 'not_found', 'There is no such route.');
  };

  const directory = async (request: Request, path: URL): Promise<Response> => {
    const who = bearer(request);
    if (who instanceof Response) return who;
    if (who.kind !== 'person') {
      return problem(403, 'insufficient_scope', 'The token does not carry the directory scope.');
    }
    if (path.pathname === '/api/v1/directory/users' && request.method === 'GET') {
      const q = (path.searchParams.get('q') ?? '').trim().toLowerCase();
      if (q === '' || q.length > 100)
        return problem(400, 'invalid_request', 'q is 1 to 100 characters.');
      const limit = Number(path.searchParams.get('limit') ?? 10);
      const found = [...people.values()]
        .filter((p) => p.active !== false && p.name.toLowerCase().includes(q))
        .slice(0, Number.isInteger(limit) && limit > 0 ? limit : 10);
      return json({ users: found.map(user) });
    }
    if (path.pathname === '/api/v1/directory/users/resolve' && request.method === 'POST') {
      const body = (await request.json().catch(() => undefined)) as { subs?: unknown } | undefined;
      const subs = body?.subs;
      if (
        !Array.isArray(subs) ||
        subs.length < 1 ||
        subs.length > 100 ||
        subs.some((s) => typeof s !== 'string' || s === '')
      ) {
        return problem(400, 'invalid_request', 'subs is 1 to 100 identifiers.');
      }
      const users: DirectoryUserStatus[] = [];
      for (const sub of subs as string[]) {
        const person = people.get(sub);
        if (person) users.push({ ...user(person), active: person.active !== false });
      }
      return json({ users });
    }
    if (path.pathname === '/api/v1/directory/users/by-email' && request.method === 'GET') {
      const email = path.searchParams.get('email') ?? '';
      if (!email.includes('@'))
        return problem(400, 'invalid_request', 'email is a whole email address.');
      return problem(404, 'not_found', 'There is no such person.');
    }
    return problem(404, 'not_found', 'There is no such route.');
  };

  const handle = async (
    request: Request,
    signal: AbortSignal | null | undefined,
  ): Promise<Response> => {
    const path = new URL(request.url);
    if (path.origin !== url) down();
    const target = targetOf(path.pathname);
    const failure = takeFailure(target);
    if (failure?.kind === 'down') down();
    if (failure?.kind === 'timeout') return hang(signal);
    if (failure?.kind === 'status') {
      return problem(
        failure.status,
        failure.status === 429 ? 'rate_limited' : 'invalid_request',
        'The fake core was told to fail.',
        {
          // Marks an answer the fake was told to give, which the contract does not have to describe.
          'x-fake-failure': 'true',
          ...(failure.retryAfter === undefined
            ? {}
            : { 'retry-after': String(failure.retryAfter) }),
        },
      );
    }

    if (path.pathname === '/.well-known/openid-configuration') {
      return json({
        issuer: url,
        token_endpoint: `${url}/api/auth/oauth2/token`,
        authorization_endpoint: `${url}/api/auth/oauth2/authorize`,
        end_session_endpoint: `${url}/api/auth/oauth2/end-session`,
        jwks_uri: `${url}/api/auth/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['EdDSA'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        authorization_response_iss_parameter_supported: true,
      });
    }
    if (path.pathname === '/api/auth/jwks') {
      return json({ keys: [(await keys()).publicJwk] });
    }
    if (path.pathname === '/.well-known/sovereign-instance') {
      const document: Record<string, unknown> = {
        name: options.instance?.name ?? 'Fake instance',
        url,
        logo: { light: null, dark: null },
        favicon: null,
      };
      if (api) document.api = api;
      return json(document as InstanceBranding, 200, { 'access-control-allow-origin': '*' });
    }
    if (path.pathname === '/api/auth/oauth2/token' && request.method === 'POST') {
      return tokenEndpoint(request, failure, signal);
    }
    if (path.pathname === '/api/v1/email') {
      const answer = await emailApi(request);
      return failure?.kind === 'lost-answer' ? hang(signal) : answer;
    }
    if (path.pathname.startsWith('/api/v1/notifications')) {
      const answer = await notificationsApi(request, path);
      return failure?.kind === 'lost-answer' ? hang(signal) : answer;
    }
    if (path.pathname.startsWith('/api/v1/')) {
      const answer = await directory(request, path);
      return failure?.kind === 'lost-answer' ? hang(signal) : answer;
    }
    return problem(404, 'not_found', 'There is no such route.');
  };

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    // The caller's own signal, held here: a Request makes a signal of its own that follows it weakly, and a timeout
    // signal nothing else refers to can be collected before it fires.
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    // Noted on arrival, with status 0 for a request that is never answered, so a lost answer is still seen.
    const entry: { method: string; path: string; status: number } = {
      method: request.method,
      path: new URL(request.url).pathname,
      status: 0,
    };
    requests.push(entry);
    const answer = await handle(request, signal);
    entry.status = answer.status;
    return answer;
  }) as typeof fetch;

  return {
    url,
    credentials,
    fetch: fakeFetch,
    addPerson(person) {
      people.set(person.sub, {
        sub: person.sub,
        name: person.name ?? person.sub,
        picture: person.picture ?? null,
        active: person.active ?? true,
      });
    },
    signIn(sub) {
      if (!people.has(sub)) people.set(sub, { sub, name: sub, picture: null, active: true });
      const token = random('rt');
      refreshTokens.set(token, { sub, used: false });
      return token;
    },
    fail(failure, { target = 'any', times = Number.POSITIVE_INFINITY } = {}) {
      failures.push({ failure, target, times });
    },
    heal() {
      failures.length = 0;
    },
    authorize(authorizationUrl, sub, options = {}) {
      const request = new URL(authorizationUrl);
      const given = request.searchParams;
      const redirectUri = given.get('redirect_uri') ?? '';
      const scope = given.get('scope') ?? '';
      const problems = [
        request.origin + request.pathname !== `${url}/api/auth/oauth2/authorize` &&
          'wrong endpoint',
        given.get('client_id') !== credentials.clientId && 'unknown client_id',
        given.get('response_type') !== 'code' && 'response_type is not code',
        given.get('code_challenge_method') !== 'S256' && 'PKCE S256 is required',
        !given.get('code_challenge') && 'a code_challenge is required',
        !redirectUri && 'a redirect_uri is required',
        !scope.split(' ').includes('openid') && 'the openid scope is required',
      ].filter(Boolean);
      if (problems.length > 0) {
        throw new Error(`the fake core refuses this authorization request: ${problems.join(', ')}`);
      }
      const code = random('code');
      const sid = random('sid');
      codes.set(code, {
        sub,
        sid,
        nonce: given.get('nonce'),
        challenge: given.get('code_challenge') ?? '',
        redirectUri,
        scope,
        roles: options.roles ?? [],
        used: false,
      });
      sessionOf.set(sub, sid);
      if (!people.has(sub)) people.set(sub, { sub, name: sub, picture: null, active: true });
      const back = new URL(redirectUri);
      back.searchParams.set('code', code);
      const state = given.get('state');
      if (state) back.searchParams.set('state', state);
      back.searchParams.set('iss', url);
      return back.toString();
    },
    sessionIdOf: (sub) => sessionOf.get(sub),
    async logoutToken(who, { wrong } = {}) {
      const issued = Math.floor(now() / 1000);
      const claims: Record<string, unknown> = {
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      };
      if (who.sub && wrong !== 'no-subject') claims.sub = who.sub;
      if (who.sid && wrong !== 'no-subject') claims.sid = who.sid;
      if (wrong === 'no-subject') delete claims.sub;
      if (wrong === 'event') claims.events = {};
      if (wrong === 'nonce') claims.nonce = 'a-nonce';
      let jwt = new SignJWT(claims)
        .setProtectedHeader({
          alg: 'EdDSA',
          kid: 'fake-1',
          typ: wrong === 'type' ? 'JWT' : 'logout+jwt',
        })
        .setIssuer(wrong === 'issuer' ? 'https://elsewhere.test' : url)
        .setAudience(wrong === 'audience' ? 'another-app' : credentials.clientId)
        .setIssuedAt(wrong === 'future' ? issued + 3600 : issued)
        .setExpirationTime(wrong === 'expired' ? issued - 10 : issued + 120);
      if (wrong !== 'no-jti') jwt = jwt.setJti(random('jti'));
      if (wrong === 'signature') {
        const other = await generateKeyPair('EdDSA');
        return jwt.sign(other.privateKey);
      }
      return jwt.sign((await keys()).privateKey);
    },
    get notificationsSent() {
      return [...sent.values()];
    },
    get emailsSent() {
      return [...emails.values()];
    },
    revoke(sub) {
      for (const [token, other] of refreshTokens)
        if (other.sub === sub) refreshTokens.delete(token);
      for (const [token, other] of accessTokens)
        if (other.kind === 'person' && other.sub === sub) accessTokens.delete(token);
    },
    expireAccessTokens() {
      accessTokens.clear();
    },
    get seen() {
      return { requests: [...requests], ...seen };
    },
  };
}

/**
 * A session store for an app's tests (sdk §9.1): records in memory, with the expiry the contract asks for. An app's own is a
 * database table or a cache; this is only for tests.
 */
export function memorySessionStore(now: () => number = () => Date.now()): SessionStore {
  const records = new Map<string, { record: StoredRecord; expiresAt: number }>();
  return {
    get(id) {
      const found = records.get(id);
      if (!found || found.expiresAt <= now()) return undefined;
      return found.record;
    },
    set(id, record, expiresAt) {
      records.set(id, { record, expiresAt });
    },
    delete(id) {
      records.delete(id);
    },
    deleteMatching({ sub, sid }) {
      for (const [id, { record }] of records) {
        if (record.kind !== 'session') continue;
        if (
          (sid !== undefined && record.sid === sid) ||
          (sid === undefined && sub !== undefined && record.sub === sub)
        ) {
          records.delete(id);
        }
      }
    },
  };
}
