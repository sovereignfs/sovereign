import type { DirectoryUser, DirectoryUserStatus, InstanceBranding } from '@sovereignfs/api-client';

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

/** One request the fake received, with nothing secret in it. `status` is 0 when it was never answered. */
export type Received = { method: string; path: string; status: number };

export type FakeCore = {
  /** The instance's address, to give `createSovereign` as `coreUrl`. */
  readonly url: string;
  /** The app's credentials in this core. */
  readonly credentials: { clientId: string; clientSecret: string };
  /** Answers like core does. Give it to `createSovereign({ fetch })`: no server, no port. */
  readonly fetch: typeof fetch;
  /** Adds a person to the Directory. */
  addPerson(person: FakePerson): void;
  /** Signs a person in, and returns the refresh token an app would have stored for them. */
  signIn(sub: string): string;
  /** Makes the next requests fail. `times` limits how many (default: until `heal`). */
  fail(failure: Failure, options?: { target?: Target; times?: number }): void;
  /** Ends every failure. */
  heal(): void;
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
  const api = 'api' in options ? options.api : { versions: ['v1'], capabilities: ['directory'] };
  const appTokens = options.appTokens ?? true;

  const people = new Map<string, Person>();
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
    const given = request.headers.get('authorization') ?? '';
    const expected = `Basic ${btoa(`${encodeURIComponent(credentials.clientId)}:${encodeURIComponent(credentials.clientSecret)}`)}`;
    if (given !== expected) {
      return json({ error: 'invalid_client', error_description: 'the app is not recognised' }, 401);
    }
    const form = new URLSearchParams(await request.text());
    const grant = form.get('grant_type');
    let answer: Response;
    if (grant === 'refresh_token') {
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
          scope: 'directory',
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
      });
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
