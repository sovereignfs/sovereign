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
  /** Development needs `'unsafe-eval'`: React uses `eval` there to rebuild server stacks in the browser. */
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
    'style-src': ["'self'", `'nonce-${nonce}'`],
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
