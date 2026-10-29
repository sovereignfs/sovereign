import { getAuth } from '../auth';
import { ApiError, errorResponse } from '../api/errors';
import { countCall } from '../api/rate-limit';
import { authenticate, type Principal, type TokenDeps } from '../api/token';
import { getConfig } from '../config';
import { getDatabase } from '../database';
import { coreApiResource } from '../oauth/provider';
import type { JSONWebKeySet } from 'jose';

/** How many calls the Directory API allows in a minute (core-app §3.9): for each app, and for each person. */
export type DirectoryLimits = { perClient: number; perAccount: number; windowMs: number };

export const DIRECTORY_LIMITS: DirectoryLimits = {
  perClient: 600,
  perAccount: 120,
  windowMs: 60_000,
};

export const DIRECTORY_SCOPE = 'directory';

/** What the Core API needs to know a token: the keys, the instance's address, and the database. */
export async function getTokenDeps(): Promise<TokenDeps> {
  const [auth, database] = await Promise.all([getAuth(), getDatabase()]);
  const origin = new URL(getConfig().url).origin;
  return {
    database,
    issuer: origin,
    audience: coreApiResource(origin),
    jwks: async () => (await auth.api.getJwks()) as unknown as JSONWebKeySet,
  };
}

/**
 * The check every Directory API call makes first: a good token with the `directory` scope, then the call is counted
 * against the app and against the person, and refused with a wait when either is over its limit. A call with a bad
 * token is never counted, so it cannot use up a legitimate caller's allowance.
 */
export async function directoryGuard(
  request: Request,
  limits: DirectoryLimits = DIRECTORY_LIMITS,
): Promise<Principal> {
  const principal = await authenticate(await getTokenDeps(), request, DIRECTORY_SCOPE);
  const database = await getDatabase();
  for (const [key, limit] of [
    [`api:directory:client:${principal.clientId}`, limits.perClient],
    [`api:directory:account:${principal.userId}`, limits.perAccount],
  ] as const) {
    const counted = await countCall(database, key, limit, limits.windowMs);
    if (!counted.allowed) {
      throw new ApiError(429, 'rate_limited', 'Too many calls. Wait, then try again.', {
        'retry-after': String(counted.retryAfter),
      });
    }
  }
  return principal;
}

/** Runs a Directory API handler, turning an `ApiError` into the contract's error answer and rethrowing anything else. */
export async function answer(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    throw error;
  }
}
