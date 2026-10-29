/**
 * The Content Security Policy, built per request around a fresh nonce.
 *
 * This runs in `proxy.ts`, so it keeps the proxy's discipline: no Node built-ins and
 * no database access, only web-standard APIs.
 *
 * `script-src` never contains `'unsafe-inline'` (core-app §3.5): a script runs only if
 * it carries the request's nonce, or was loaded by one that does (`'strict-dynamic'`).
 */

/** A fresh, unguessable nonce: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type CspOptions = {
  nonce: string;
  /**
   * Development needs `'unsafe-eval'`, since React uses `eval` there to rebuild server stacks in the browser, and
   * inline styles, which Next's error overlay and indicator are made of.
   */
  development?: boolean;
  /**
   * Ask the browser to upgrade `http:` subresources to `https:`. Only right when core is
   * served over https: on a plain-http address (a local `next start`) some browsers would
   * upgrade requests to the same host and break the page.
   */
  upgradeInsecureRequests?: boolean;
  /**
   * Let the page show pictures from other addresses: the launcher draws each app's icon from the address an
   * operator gave. An image cannot run script, so this is only for that page, and it is `https:` alone,
   * with `http:` on `localhost` where core is itself a development instance.
   */
  remoteImages?: boolean;
};

export function buildCsp({
  nonce,
  development = false,
  upgradeInsecureRequests = false,
  remoteImages = false,
}: CspOptions): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    // A nonce makes a browser ignore `'unsafe-inline'`, so development, whose error overlay and indicator
    // style themselves inline, has the one or the other: with the nonce they are drawn as a blank box.
    'style-src': development ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    // A `style=""` attribute cannot run script, and the design system sets CSS custom
    // properties through them. Style *elements* still need the nonce.
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': [
      "'self'",
      'blob:',
      'data:',
      ...(remoteImages ? ['https:'] : []),
      ...(remoteImages && development ? ['http://localhost:*', 'http://*.localhost:*'] : []),
    ],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    // Core's own service worker, named: a worker's policy otherwise falls back to `script-src`, where
    // `'strict-dynamic'` makes a browser ignore `'self'`.
    'worker-src': ["'self'"],
    // The web app manifest is core's own.
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives).map(
    ([name, sources]) => `${name} ${sources.join(' ')}`,
  );
  if (upgradeInsecureRequests) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

/**
 * The headers every response carries beside the policy (core-app §3.5). None of them depends on the request:
 *
 * - `nosniff`: a response is the type it says it is, so an uploaded picture is never run as a script.
 * - `X-Frame-Options`: what `frame-ancestors 'none'` says, for a browser that reads only this.
 * - `Referrer-Policy`: another site is told where a person came from, never the path, so an invitation or
 *   a reset address in the one they came from does not leave core.
 * - `Permissions-Policy`: no page here asks for the camera, microphone, location or a payment, so none may.
 *   Passkeys are left alone: they are allowed to the page's own origin by default.
 * - `Strict-Transport-Security`: only when core is served over https, since over http a browser ignores it
 *   and a name that has seen it on https will refuse http for a year. It names no subdomains.
 */
export function securityHeaders({ https }: { https: boolean }): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    ...(https ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}
