/**
 * Security headers (RFC 0008 Tier 0 / SRS §3.17). Pure helpers shared by the
 * runtime middleware (per-request CSP nonce) and reused conceptually by the
 * static headers in `next.config.ts`. Edge-safe: no Node APIs.
 */

/**
 * CSP hash of the root layout's inline theme script (`./theme-script`). Allows
 * that one fixed inline script without a nonce, so the layout stays statically
 * renderable. `security.test.ts` recomputes this from the script and fails on
 * drift — update it (and only it) when the theme script changes.
 */
export const THEME_SCRIPT_CSP_HASH = "'sha256-qAARbpP9iFUEHhCRNYBBhInXMPdIEEZMEjxq7UOvuf0='";

/** A per-request base64 nonce for the Content-Security-Policy `script-src`. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Build the Content-Security-Policy header value. Strict, nonce-based: inline
 * scripts (the runtime's pre-paint theme script and Next's bootstrap) run only
 * with the matching nonce — no `'unsafe-inline'` for scripts. `style-src` keeps
 * `'unsafe-inline'` because Next injects un-nonced critical CSS and style
 * injection is low-risk. `upgrade-insecure-requests` is production-only so it
 * never rewrites `http://localhost` subresources in dev.
 */
export function buildContentSecurityPolicy(nonce: string, opts: { isProd: boolean }): string {
  // Dev only: Next/webpack evaluate modules with eval() (eval-source-map), which
  // a strict script-src would block (no hydration). Production uses real bundles
  // — never ship 'unsafe-eval'.
  const devEval = opts.isProd ? '' : ` 'unsafe-eval'`;
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' ${THEME_SCRIPT_CSP_HASH}${devEval}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    ...(opts.isProd ? [`upgrade-insecure-requests`] : []),
  ];
  return directives.join('; ');
}
