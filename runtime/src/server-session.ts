import { getCookieCache } from 'better-auth/cookies';
import { headers } from 'next/headers';
import {
  type CachedSessionData,
  type VerifiedSession,
  resolveAuthSecret,
  verifiedUserFromCache,
} from './session-verify';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

/**
 * Read and verify the request's session from a Server Component, mirroring the
 * middleware's two-step check (SRS AUTH-05/06): the local signed `session_data`
 * cookie cache first, then the auth server's `/api/verify` fallback for when the
 * cache cookie is absent or past its `maxAge` window. Returns null when the
 * request is unauthenticated.
 *
 * The middleware matcher excludes the auth pages (`/login`, `/register`) so an
 * unauthenticated visitor can reach them without the session gate looping. Those
 * pages call this instead to bounce an *already authenticated* visitor to `/`
 * rather than render the form — which matters on iOS PWA relaunch, where the
 * standalone app restores its last-visited URL and could reopen on `/login`.
 *
 * The `/api/verify` fallback is essential here, not optional: after a >5-minute
 * background (typical for a relaunch) the `session_data` cache cookie has
 * expired, so a cache-only check would wrongly treat a valid session as
 * signed-out.
 */
export async function readServerSession(): Promise<VerifiedSession | null> {
  const requestHeaders = await headers();

  const secret = resolveAuthSecret();
  if (secret) {
    // The cache cookie name carries the `__Secure-` prefix in production; try both
    // so the read works regardless of NODE_ENV drift (same as the middleware).
    for (const isSecure of [undefined, true, false] as const) {
      const cached = (await getCookieCache(requestHeaders, {
        secret,
        ...(isSecure === undefined ? {} : { isSecure }),
      }).catch(() => null)) as CachedSessionData | null;
      const session = verifiedUserFromCache(cached);
      if (session) return session;
    }
  }

  try {
    const verify = await fetch(`${AUTH_URL}/api/verify`, {
      headers: { cookie: requestHeaders.get('cookie') ?? '' },
    });
    if (!verify.ok) return null;
    return (await verify.json()) as VerifiedSession;
  } catch {
    return null;
  }
}
