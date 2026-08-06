import { type NextRequest, NextResponse } from 'next/server';
import { buildContentSecurityPolicy, generateNonce } from '@/src/security';

/**
 * Sets a strict, nonce-based Content-Security-Policy on the auth app's HTML
 * responses (RFC 0008 Tier 0). The nonce is placed on the request's CSP header
 * so Next applies it to its inline bootstrap scripts; the auth pages render
 * dynamically (`export const dynamic = 'force-dynamic'` in the root layout) so
 * the per-request nonce is actually injected. Static headers (HSTS, frame
 * options, etc.) come from `next.config.ts`. API routes are excluded by the
 * matcher — they return JSON and get only the static headers.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce, {
    isProd: process.env.NODE_ENV === 'production',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // HTML pages only — exclude API routes (JSON; static headers suffice) and
  // Next's static assets.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};
