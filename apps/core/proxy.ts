import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from './src/csp';

/**
 * Applies the Content Security Policy to every response. The nonce is also handed to
 * the page through the request, where Next reads it to stamp its own scripts.
 *
 * Keep the Edge discipline here: no Node built-ins and no database access. Every way
 * out of this function goes through `withCsp`, so a branch added later (a redirect to
 * sign-in, say) cannot skip the header.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    development: process.env.NODE_ENV === 'development',
    // SV_URL is validated at start-up (instrumentation.ts); the proxy only reads it, and
    // not through the configuration package, to keep to web-standard APIs.
    upgradeInsecureRequests: (process.env.SV_URL ?? '').trim().startsWith('https://'),
  });

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);

  return withCsp(NextResponse.next({ request: { headers } }), csp);
}

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

// Everything, API routes and static files included: the policy goes on every response.
export const config = {
  matcher: '/:path*',
};
