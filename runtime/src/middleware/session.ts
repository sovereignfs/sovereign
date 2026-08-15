/**
 * Middleware session verification: local signed cookie-cache verification
 * (SRS AUTH-05, no network call), the auth-server `/api/verify` fallback
 * (AUTH-06), and a single `verifySession()` entry point combining both.
 * Extracted from `runtime/middleware.ts` (Task 2.17) — behavior unchanged,
 * purely a relocation.
 */
import { getCookieCache } from 'better-auth/cookies';
import type { NextRequest } from 'next/server';
import {
  type CachedSessionData,
  type VerifiedSession,
  resolveAuthSecret,
  verifiedUserFromCache,
} from '@/src/session-verify';

export const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

/**
 * Verify the request's session **locally** from better-auth's signed
 * `session_data` cookie cache — no network call (SRS AUTH-05). The cookie is
 * HMAC-signed with the shared auth secret, so a forged one cannot pass. Returns
 * null when no secret is configured or no valid cache cookie is present, so the
 * caller falls back to `/api/verify`. The cookie name carries the `__Secure-`
 * prefix in production; try both so the read works in dev and prod regardless of
 * NODE_ENV drift.
 */
export async function verifyFromCookieCache(request: NextRequest): Promise<VerifiedSession | null> {
  const secret = resolveAuthSecret();
  if (!secret) return null;
  for (const isSecure of [undefined, true, false] as const) {
    const cached = (await getCookieCache(request, {
      secret,
      ...(isSecure === undefined ? {} : { isSecure }),
    }).catch(() => null)) as CachedSessionData | null;
    const session = verifiedUserFromCache(cached);
    if (session) return session;
  }
  return null;
}

/**
 * Verify the request against the auth server's /api/verify (AUTH-06) — the
 * fallback when local verification has no cookie to read (e.g. a session that
 * predates cookie-cache rollout, or just past the cache window). Returns the
 * session plus better-auth's Set-Cookie headers, which the caller forwards so
 * the `session_data` cache (re)installs and subsequent requests verify locally.
 *
 * Fails closed: a non-OK response *or* an unreachable auth server (fetch
 * throws) returns null, so the caller redirects to /login rather than crashing
 * the request with a 500.
 */
export async function verifyViaAuthServer(
  request: NextRequest,
): Promise<SessionVerificationResult | null> {
  try {
    const verify = await fetch(`${AUTH_URL}/api/verify`, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
    });
    if (!verify.ok) return null;
    const payload = (await verify.json()) as VerifiedSession;
    return { session: payload, setCookies: verify.headers.getSetCookie() };
  } catch {
    return null;
  }
}

/** A verified session plus any Set-Cookie headers the caller must forward. */
export interface SessionVerificationResult {
  session: VerifiedSession;
  setCookies: string[];
}

/**
 * Verify the request's session, local cookie-cache first, falling back to
 * the auth server on a cache miss (SRS AUTH-05/06). Returns null when both
 * fail — the caller decides what "no session" means for its own path (the
 * main session gate redirects to `/login`; the public-route and handoff
 * branches proceed anonymously instead).
 */
export async function verifySession(
  request: NextRequest,
): Promise<SessionVerificationResult | null> {
  const cached = await verifyFromCookieCache(request);
  if (cached) return { session: cached, setCookies: [] };
  return verifyViaAuthServer(request);
}
