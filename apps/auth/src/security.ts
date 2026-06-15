/**
 * Security headers for the auth app (RFC 0008 Tier 0 / SRS §3.17). Mirrors the
 * runtime's `runtime/src/security.ts` (the two apps share no code) but without
 * the runtime's inline theme-script hash — the auth app has no custom inline
 * scripts, only Next's bootstrap, which the per-request nonce covers. Edge-safe.
 */

/** A per-request base64 nonce for the Content-Security-Policy `script-src`. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Build the auth app's Content-Security-Policy. Strict, nonce-based (no
 * `'unsafe-inline'` for scripts). `upgrade-insecure-requests` is production-only. */
export function buildContentSecurityPolicy(nonce: string, opts: { isProd: boolean }): string {
  // Dev only: Next/webpack evaluate modules with eval(), which a strict
  // script-src would block (no hydration). Never ship 'unsafe-eval' in prod.
  const devEval = opts.isProd ? '' : ` 'unsafe-eval'`;
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'${devEval}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    ...(opts.isProd ? [`upgrade-insecure-requests`] : []),
  ];
  return directives.join('; ');
}
