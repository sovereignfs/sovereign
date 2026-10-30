import type { Database } from '@sovereignfs/database';
import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose';
import { NAMES } from '../oauth/schema-names';
import { isAppTokenRevoked, isTokenRevoked } from '../oauth/revocation';
import { ApiError } from './errors';

/** Who is calling the Core API for a person: the person, the app, and what the token allows. */
export type Principal = { userId: string; clientId: string; scopes: string[] };

/** Who is calling the Core API for itself (core-app §3.6.6): the app, and what the token allows. No person, no session. */
export type AppPrincipal = { clientId: string; scopes: string[] };

export type TokenDeps = {
  database: Pick<Database, 'run'>;
  /** Core's own public keys, as the provider publishes them. */
  jwks: () => Promise<JSONWebKeySet>;
  /** The instance's own address, which is every token's issuer. */
  issuer: string;
  /** The Core API's address, which a token for it is addressed to: `<issuer>/api/v1`. */
  audience: string;
  now?: () => number;
};

const MAX_TOKEN_LENGTH = 4096;
const REALM = 'Sovereign Core API';

const unauthorized = (message: string, error?: 'invalid_token'): ApiError =>
  new ApiError(401, 'invalid_token', message, {
    'www-authenticate': error
      ? `Bearer realm="${REALM}", error="${error}"`
      : `Bearer realm="${REALM}"`,
  });
const invalid = (message = 'The access token is not valid.') =>
  unauthorized(message, 'invalid_token');

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/**
 * Lets a call into the Core API (core-app §3.9) only if its access token is good, and says who it is for. The
 * token is a signed JWT the provider issued to an app for a signed-in person, asked for with
 * `resource=<origin>/api/v1`, and it must be all of:
 *
 * - signed by one of core's own keys, with EdDSA, typed `at+jwt` (so an ID token is not one), issued by this
 *   instance, addressed to the Core API, and not expired;
 * - for a scope the call needs (`insufficient_scope`, with the scope named, when it is not);
 * - for an account that exists and is active, from an app that exists and is switched on;
 * - from a session that is still open: ending a session ends what it was used to get;
 * - not revoked. A signature alone is not enough, because a token revoked by deactivating the account or by
 *   Remove access would otherwise work until it expires (`isTokenRevoked`).
 *
 * Every way a token can be bad is the same 401 with the same header, since which of these it was is not for a
 * caller to learn, except that an expired token says so, which is what a caller can act on.
 */
export async function authenticate(
  deps: TokenDeps,
  request: Request,
  scope: string,
): Promise<Principal> {
  const token = await verified(deps, request);
  const { payload, userId, clientId, scopes } = token;
  // A token an app got for itself names the app as its subject. It is not a person's, and nothing it carries is.
  if (userId === clientId) throw invalid();
  requireScope(scopes, scope);

  const now = deps.now?.() ?? Date.now();
  const user = (await deps.database.run('select deactivated_at from users where id = ?', [userId]))
    .rows[0];
  if (!user || (user.deactivated_at !== null && user.deactivated_at !== undefined)) {
    throw invalid('The access token is no longer valid.');
  }
  const client = await clientRow(deps, clientId);
  if (!client || client.disabled === true || Number(client.disabled) === 1) {
    throw invalid('The access token is no longer valid.');
  }
  const sessionId = text(payload.sid);
  if (sessionId) {
    const session = (
      await deps.database.run('select expires_at from sessions where id = ?', [sessionId])
    ).rows[0];
    if (!session || new Date(session.expires_at as string | number | Date).getTime() <= now) {
      throw invalid('The access token is no longer valid.');
    }
  }
  if (await isTokenRevoked(deps.database, userId, clientId, token.issuedAt)) {
    throw invalid('The access token is no longer valid.');
  }
  return { userId, clientId, scopes };
}

/**
 * Lets a call into the Core API in only if its token was issued to an app for itself (core-app §3.6.6), and says which app. The
 * token is checked as a person's is (signature, type, issuer, audience, expiry), and then:
 *
 * - it is an app's own token: its subject is the app. A person's token is refused here as an app's is refused above;
 * - the scope the call needs is in the token **and** among the app scopes the app holds now, so taking a scope away from an app
 *   stops it at once, though the token still says it;
 * - the app exists, is switched on and is confidential;
 * - the token was not revoked: rotating the app's secret or switching it off records the time (`revokeAppTokens`).
 *
 * There is no account, session or consent to check, because none was involved.
 */
export async function authenticateApp(
  deps: TokenDeps,
  request: Request,
  scope: string,
): Promise<AppPrincipal> {
  const token = await verified(deps, request);
  const { userId, clientId, scopes } = token;
  if (userId !== clientId || text(token.payload.sid)) throw invalid();
  requireScope(scopes, scope);

  const client = await clientRow(deps, clientId);
  if (
    !client ||
    client.disabled === true ||
    Number(client.disabled) === 1 ||
    client.authMethod === 'none'
  ) {
    throw invalid('The access token is no longer valid.');
  }
  if (!appScopesOf(client.appScopes).includes(scope)) {
    throw new ApiError(403, 'insufficient_scope', `The app may not ${scope}.`, {
      'www-authenticate': `Bearer realm="${REALM}", error="insufficient_scope", scope="${scope}"`,
    });
  }
  if (await isAppTokenRevoked(deps.database, clientId, token.issuedAt)) {
    throw invalid('The access token is no longer valid.');
  }
  return { clientId, scopes };
}

type Verified = {
  payload: JWTPayload;
  userId: string;
  clientId: string;
  scopes: string[];
  issuedAt: number;
};

/** The part every token must pass: a bearer, signed by core, of the right type, issuer and audience, not expired. */
async function verified(deps: TokenDeps, request: Request): Promise<Verified> {
  const header = request.headers.get('authorization');
  const token = /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1];
  if (!token) throw unauthorized('A bearer access token is required.');
  if (token.length > MAX_TOKEN_LENGTH) throw invalid();

  let payload: JWTPayload;
  try {
    const keys = createLocalJWKSet(await deps.jwks());
    ({ payload } = await jwtVerify(token, keys, {
      issuer: deps.issuer,
      audience: deps.audience,
      algorithms: ['EdDSA'],
      typ: 'at+jwt',
      ...(deps.now ? { currentDate: new Date(deps.now()) } : {}),
    }));
  } catch (error) {
    if (error instanceof errors.JWTExpired) throw invalid('The access token has expired.');
    throw invalid();
  }

  const userId = text(payload.sub);
  const clientId = text(payload.client_id) ?? text(payload.azp);
  const scopes = (text(payload.scope) ?? '').split(' ').filter((name) => name !== '');
  if (!userId || !clientId || typeof payload.iat !== 'number') throw invalid();
  return { payload, userId, clientId, scopes, issuedAt: payload.iat };
}

function requireScope(scopes: readonly string[], scope: string): void {
  if (!scopes.includes(scope)) {
    throw new ApiError(403, 'insufficient_scope', `The access token does not allow ${scope}.`, {
      'www-authenticate': `Bearer realm="${REALM}", error="insufficient_scope", scope="${scope}"`,
    });
  }
}

async function clientRow(deps: TokenDeps, clientId: string) {
  const { rows } = await deps.database.run(
    `select ${NAMES.client.disabled} as disabled, ${NAMES.client.authMethod} as auth_method, ${NAMES.client.appScopes} as app_scopes
       from ${NAMES.clients} where ${NAMES.client.clientId} = ?`,
    [clientId],
  );
  const row = rows[0];
  if (!row) return undefined;
  return { disabled: row.disabled, authMethod: row.auth_method, appScopes: row.app_scopes };
}

/**
 * The app scopes a row holds: an array on PostgreSQL, and JSON text on SQLite and sqld, which the provider's adapter writes as a
 * JSON string of a JSON string, so text is read until it is a list.
 */
function appScopesOf(value: unknown): string[] {
  let list: unknown = value;
  for (let step = 0; step < 3 && typeof list === 'string'; step += 1) {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  return Array.isArray(list) ? list.filter((name): name is string => typeof name === 'string') : [];
}
