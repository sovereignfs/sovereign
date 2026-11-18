import { PWA_CSP_DIRECTIVES } from '@sovereignfs/pwa';

/**
 * The Content-Security-Policy every page is sent with (`proxy.ts`), after the deployed apps' own. Nothing may run that the server did not
 * mark, and nothing loads from another site:
 *
 * - **Scripts** run only with this request's nonce, or when a script that has it loads them (`'strict-dynamic'`): the bundles Next adds.
 *   No inline handler, no `javascript:` address, no `eval` but in development, where React wants it.
 * - **Style elements** carry the nonce; **style attributes** are allowed, which the design system positions overlays with and which can
 *   change how something looks but not run anything.
 * - **Everything else is this origin's**: images, fonts, what the page fetches, the service worker and the manifest.
 * - **Forms** go to this origin and to core: signing out posts here, and the answer sends the browser on to core.
 * - Nobody may frame a page, `<base>` cannot be changed, and over https every request of the page is made over https.
 *
 * Kept free of Node's built-ins, since the proxy imports it.
 */
export type PolicyOptions = {
  /** New for every request, unguessable. */
  nonce: string;
  /** The app's own address is https. */
  secure: boolean;
  /** `next dev`, which needs `eval` and inline styles for its overlay. */
  development: boolean;
  /** Core's origin, where signing out goes on to. */
  core?: string;
};

export function contentSecurityPolicy({ nonce, secure, development, core }: PolicyOptions): string {
  // A nonce in the list makes browsers ignore 'unsafe-inline', so in development the styles allow inline alone.
  const styles = development ? "'self' 'unsafe-inline'" : `'self' 'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    `style-src ${styles}`,
    `style-src-elem ${styles}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    ...PWA_CSP_DIRECTIVES,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${core ? ` ${core}` : ''}`,
    "frame-ancestors 'none'",
    ...(secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** 128 bits from the platform's random source, for one request. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** The origin of an address, or nothing when it is not an http(s) address. */
export function originOf(address: string | undefined): string | undefined {
  if (!address) return undefined;
  try {
    const url = new URL(address);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
