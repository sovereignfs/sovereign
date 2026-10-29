import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import type { Auth } from '../auth/auth';
import { BASE_URL, call, type Jar } from './auth-harness';

/** A relying party's view of core's OpenID Connect provider: what an off-the-shelf client would send. */
export const REDIRECT = 'https://rp.example.com/cb';

export type RegisteredClient = { clientId: string; secret: string | undefined };

export type ClientOptions = {
  /** Scopes the client is allowed to ask for. */
  scope?: string;
  redirectUris?: string[];
  /** Skips consent: the client is trusted (core-app §3.6.4). */
  trusted?: boolean;
  /** `none` makes a public client, which has no secret. */
  authMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
  grantTypes?: string[];
  postLogoutRedirectUris?: string[];
  applicationType?: 'web' | 'native';
};

/** Registers a client the way an operator will: through the provider's own server API, as the owner. */
export async function registerClient(
  auth: Auth,
  owner: Jar,
  options: ClientOptions = {},
): Promise<RegisteredClient> {
  const created = (await auth.api.adminCreateOAuthClient({
    body: {
      redirect_uris: options.redirectUris ?? [REDIRECT],
      scope: options.scope ?? 'openid profile email roles offline_access',
      token_endpoint_auth_method: options.authMethod ?? 'client_secret_basic',
      grant_types: options.grantTypes ?? ['authorization_code', 'refresh_token'],
      skip_consent: options.trusted ?? true,
      ...(options.applicationType ? { application_type: options.applicationType } : {}),
      ...(options.postLogoutRedirectUris
        ? { post_logout_redirect_uris: options.postLogoutRedirectUris }
        : {}),
    },
    headers: new Headers({ cookie: owner.header() ?? '' }),
  })) as { client_id: string; client_secret?: string };
  return { clientId: created.client_id, secret: created.client_secret };
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
    null,
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
