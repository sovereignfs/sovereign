import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import type { Database } from '@sovereignfs/database';
import type { Auth } from '../auth/auth';
import { ClientRegistry, type UserActor } from '../clients/registry';
import { BASE_URL, call, type Jar } from './auth-harness';

/** A relying party's view of core's OpenID Connect provider: what an off-the-shelf client would send. */
export const REDIRECT = 'https://rp.sovereign.local/cb';

export type RegisteredClient = { clientId: string; secret: string | undefined };

export type ClientOptions = {
  /** Scopes the client is allowed to ask for. */
  scope?: string;
  redirectUris?: string[];
  /** Skips consent: the client is trusted (core-app §3.6.4). */
  trusted?: boolean;
  /** `none` makes a public client, which has no secret. */
  authMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
  postLogoutRedirectUris?: string[];
  /** The name shown on the consent page. */
  name?: string;
  /** Lets the app send someone to core's end-session endpoint. */
  enableEndSession?: boolean;
  /** Where core tells the app that a session ended. */
  backchannelLogoutUri?: string;
  /** How the app's ID tokens are signed (core-app §3.6.1). EdDSA unless said. */
  idTokenAlgorithm?: 'EdDSA' | 'RS256';
};

let registryDatabase: Database | undefined;

/** The database the registry judges `client:manage` by and clears tokens from: the suite's own. */
export function useDatabase(database: Database): void {
  registryDatabase = database;
}

/** The registry the tests register clients through: development, since core's test address is http. */
export function registryFor(auth: Auth): ClientRegistry {
  if (!registryDatabase) throw new Error('call useDatabase(db) in the suite first');
  return new ClientRegistry(auth, registryDatabase, { development: true });
}

/** Who is asking, as the registry sees it: the person behind a browser's cookies. */
export async function actorOf(auth: Auth, jar: Jar): Promise<UserActor> {
  const headers = new Headers({ cookie: jar.header() ?? '' });
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('nobody is signed in');
  return { user: { id: session.user.id, role: session.user.role }, headers };
}

/** Registers a client the way an operator will: through the registry, as the owner. */
export async function registerClient(
  auth: Auth,
  owner: Jar,
  options: ClientOptions = {},
): Promise<RegisteredClient> {
  const { client, secret } = await registryFor(auth).register(await actorOf(auth, owner), {
    name: options.name ?? 'Test app',
    type: options.authMethod === 'none' ? 'public' : 'confidential',
    ...(options.authMethod === 'client_secret_post' ? { secretIn: 'body' as const } : {}),
    ...(options.idTokenAlgorithm ? { idTokenAlgorithm: options.idTokenAlgorithm } : {}),
    redirectUris: options.redirectUris ?? [REDIRECT],
    // An untrusted app may not be allowed `roles` (core-app §3.6.4), so its default leaves it out.
    scopes: (
      options.scope ??
      ((options.trusted ?? true)
        ? 'openid profile email roles offline_access'
        : 'openid profile email offline_access')
    ).split(' '),
    trusted: options.trusted ?? true,
    endSession: options.enableEndSession ?? false,
    ...(options.postLogoutRedirectUris
      ? { postLogoutRedirectUris: options.postLogoutRedirectUris }
      : {}),
    ...(options.backchannelLogoutUri ? { backchannelLogoutUri: options.backchannelLogoutUri } : {}),
  });
  return { clientId: client.clientId, secret };
}

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export type AuthorizeOptions = {
  scope?: string;
  redirectUri?: string;
  challenge?: string | null;
  method?: string;
  responseType?: string;
  state?: string;
  nonce?: string;
};

/** The authorization request, made with the person's session cookie. */
export async function authorize(
  auth: Auth,
  jar: Jar,
  client: RegisteredClient,
  options: AuthorizeOptions = {},
) {
  const params: Record<string, string> = {
    client_id: client.clientId,
    response_type: options.responseType ?? 'code',
    redirect_uri: options.redirectUri ?? REDIRECT,
    scope: options.scope ?? 'openid',
    state: options.state ?? 'state-1',
    nonce: options.nonce ?? 'nonce-1',
  };
  if (options.challenge !== null) {
    params.code_challenge = options.challenge ?? 'x'.repeat(43);
    params.code_challenge_method = options.method ?? 'S256';
  }
  const reply = await call(auth, 'GET', `/oauth2/authorize?${new URLSearchParams(params)}`, {
    jar,
    origin: null,
  });
  const location = reply.headers.get('location');
  const url = location ? new URL(location, BASE_URL) : undefined;
  return {
    reply,
    location,
    url,
    code: url?.searchParams.get('code') ?? undefined,
    // A refusal of a response type other than `code` comes in the fragment, not the query.
    error:
      url?.searchParams.get('error') ??
      new URLSearchParams(url?.hash.slice(1) ?? '').get('error') ??
      (reply.body.error as string | undefined),
  };
}

export type TokenReply = { status: number; body: Record<string, unknown> };

/** A request to the token (or any form-posting) endpoint, authenticated as the client says. */
export async function formPost(
  auth: Auth,
  path: string,
  fields: Record<string, string>,
  client?: RegisteredClient,
  how: 'basic' | 'post' = 'basic',
): Promise<TokenReply> {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  const body = { ...fields };
  if (client?.secret !== undefined) {
    if (how === 'basic') {
      headers.authorization = `Basic ${Buffer.from(`${client.clientId}:${client.secret}`).toString('base64')}`;
    } else {
      body.client_id = client.clientId;
      body.client_secret = client.secret;
    }
  } else if (client) {
    body.client_id = client.clientId;
  }
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: 'POST',
      headers,
      body: new URLSearchParams(body).toString(),
    }),
  );
  const text = await response.text();
  try {
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    };
  } catch {
    return { status: response.status, body: { raw: text } };
  }
}

export const exchangeCode = (
  auth: Auth,
  client: RegisteredClient,
  code: string,
  verifier: string,
  redirectUri = REDIRECT,
) =>
  formPost(
    auth,
    '/oauth2/token',
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier },
    client,
  );

export const refresh = (auth: Auth, client: RegisteredClient, refreshToken: string) =>
  formPost(
    auth,
    '/oauth2/token',
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    client,
  );

/** Signs in to a client end to end and returns what it was given. */
export async function signInTo(
  auth: Auth,
  jar: Jar,
  client: RegisteredClient,
  options: AuthorizeOptions = {},
) {
  const { verifier, challenge } = pkce();
  const authorized = await authorize(auth, jar, client, { ...options, challenge });
  if (!authorized.code)
    throw new Error(`no code: ${authorized.location ?? JSON.stringify(authorized.reply.body)}`);
  const tokens = await exchangeCode(auth, client, authorized.code, verifier, options.redirectUri);
  return { authorized, tokens };
}

type Jwk = Record<string, string>;
export type Jwt = { header: Record<string, unknown>; payload: Record<string, unknown> };

/** Checks an ID token's EdDSA signature against the published keys, as a relying party would. */
export function verifyJwt(token: string, jwks: readonly Jwk[]): Jwt {
  const [header64, payload64, signature64] = token.split('.');
  if (!header64 || !payload64 || !signature64) throw new Error('not a JWT');
  const header = JSON.parse(Buffer.from(header64, 'base64url').toString()) as Record<
    string,
    unknown
  >;
  const key = jwks.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error(`no published key for ${String(header.kid)}`);
  const valid = verify(
    // An RS256 token is checked as RSA with SHA-256; an EdDSA one has no digest to name.
    header.alg === 'RS256' ? 'sha256' : null,
    Buffer.from(`${header64}.${payload64}`),
    createPublicKey({ key: key as never, format: 'jwk' }),
    Buffer.from(signature64, 'base64url'),
  );
  if (!valid) throw new Error('bad signature');
  return {
    header,
    payload: JSON.parse(Buffer.from(payload64, 'base64url').toString()) as Record<string, unknown>,
  };
}

export const publishedKeys = async (auth: Auth) =>
  ((await call(auth, 'GET', '/jwks', { origin: null })).body as { keys: Jwk[] }).keys;

export async function userInfo(auth: Auth, accessToken: string) {
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
  };
}

/** The signed part of the sign-in or consent address, as the page would send it back. */
function signedQueryFor(location: string): string {
  const params = new URL(location, BASE_URL).searchParams;
  const names = new Set(params.getAll('ba_param'));
  const signed = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === 'sig' || key === 'ba_param' || names.has(key)) signed.append(key, value);
  }
  return signed.toString();
}

/**
 * What an app is given for a person: the authorization code flow (with consent given when it is asked for), asking for the Core
 * API as the resource unless told otherwise. Returns the access token.
 */
export async function personToken(
  auth: Auth,
  jar: Jar,
  client: RegisteredClient,
  options: { resource?: string | null; scope?: string; audience: string },
): Promise<string> {
  const scope = options.scope ?? 'directory';
  const { verifier, challenge } = pkce();
  let authorized = await authorize(auth, jar, client, { scope: `openid ${scope}`, challenge });
  if (!authorized.code && authorized.url?.pathname === '/consent') {
    await call(auth, 'POST', '/oauth2/consent', {
      jar,
      body: { accept: true, oauth_query: signedQueryFor(authorized.location as string) },
    });
    authorized = await authorize(auth, jar, client, { scope: `openid ${scope}`, challenge });
  }
  if (!authorized.code) throw new Error(`no code: ${authorized.location}`);
  const resource = options.resource === undefined ? options.audience : options.resource;
  const reply = await formPost(
    auth,
    '/oauth2/token',
    {
      grant_type: 'authorization_code',
      code: authorized.code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      ...(resource ? { resource } : {}),
      scope,
    },
    client,
  );
  if (reply.status !== 200) throw new Error(`no token: ${JSON.stringify(reply.body)}`);
  return String(reply.body.access_token);
}
