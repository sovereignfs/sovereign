import { type NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy, newNonce, originOf } from './lib/csp';

/**
 * **Every page is sent with a Content-Security-Policy** with a nonce of its own (`lib/csp.ts`). The proxy makes the nonce and puts the
 * policy on the request, where Next reads it and puts the nonce on the scripts it adds, and on the response, where the browser enforces
 * it; the layout makes every page render per request, which a nonce needs. API answers, the sign-in routes, the service worker, the
 * manifest, the icons and the built files are not pages, and are left alone.
 *
 * It only looks at the request: no database, no Node built-in, and never the only thing standing in a request's way.
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const policy = contentSecurityPolicy({
    nonce,
    secure: (process.env.__PREFIX___URL ?? '').startsWith('https://'),
    development: process.env.NODE_ENV === 'development',
    core: originOf(process.env.__PREFIX___CORE_URL),
  });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api/|auth/|_next/static|_next/image|sw\\.js|manifest\\.webmanifest|pwa-icon/|favicon\\.ico).*)',
      // A prefetch is not a page someone sees: it needs no nonce of its own.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
