import { NextResponse } from 'next/server';
import { BUILTIN_OAUTH_CLIENTS, seedBuiltinOAuthClient } from '../../../src/builtin-oauth-clients';

/**
 * The generated `client_id`s of the well-known, first-party OAuth clients
 * seeded at startup (RFC 0072 addendum, epic task 1.24). Public and
 * unauthenticated by design — these are public client identifiers (PKCE,
 * `token_endpoint_auth_method: "none"`), not secrets; the whole point is that
 * a shell can discover its own instance-specific `client_id` before login.
 * Reachable without authentication, same posture as `/api/health`.
 *
 * Re-seeds on read rather than trusting startup alone: `instrumentation.ts`
 * seeds once at boot, but a request landing before that has run (or an
 * instance upgraded mid-request-cycle) would otherwise see clients missing.
 * `seedBuiltinOAuthClient` is idempotent, so this is a safe, cheap fallback,
 * not a duplicate seed path.
 */
export async function GET(): Promise<Response> {
  try {
    const desktop = await seedBuiltinOAuthClient(BUILTIN_OAUTH_CLIENTS.desktop);
    const mobile = await seedBuiltinOAuthClient(BUILTIN_OAUTH_CLIENTS.mobile);
    return NextResponse.json({ desktop, mobile });
  } catch {
    // Degrade gracefully — a shell not finding its client_id yet should not
    // block onboarding; it falls back to no OAuth (cookie-only) auth.
    return NextResponse.json({ desktop: null, mobile: null });
  }
}
