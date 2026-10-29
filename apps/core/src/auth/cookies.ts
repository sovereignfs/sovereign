/**
 * The names core's cookies have, in one place, because three things must agree on them: better-auth, which sets them,
 * the proxy, which looks for the session, and the routes that clear the session cache.
 *
 * The prefix says what a browser promises about a cookie:
 *
 * - `__Host-` when core is served over https and `SV_AUTH_COOKIE_DOMAIN` is unset. A browser refuses such a cookie
 *   unless it is `Secure`, has `Path=/` and has **no** `Domain`, so no other host can set it for core: an app on a
 *   subdomain cannot plant a cookie with `Domain=<parent>` that core would read as its own (cookie tossing).
 * - `__Secure-` when core is served over https and a cookie domain is set. The cookie must be shared with the
 *   subdomains, which `__Host-` forbids, so this is the weaker promise: only that it is `Secure`.
 * - none over http, where a browser would ignore either prefix.
 *
 * No imports, because the proxy runs on the Edge and reads this too.
 */
export type CookiePolicy = {
  /** Core is served over https. */
  secure: boolean;
  /** `SV_AUTH_COOKIE_DOMAIN`, when set. */
  domain: string | undefined;
};

export type NamePrefix = '__Host-' | '__Secure-' | '';

/** The part of a name better-auth puts first, and that this module puts after the prefix. */
const BASE = 'better-auth';

export function namePrefix({ secure, domain }: CookiePolicy): NamePrefix {
  if (!secure) return '';
  return domain === undefined ? '__Host-' : '__Secure-';
}

/** The name of one of better-auth's cookies (`session_token`, `session_data`, ...) under this policy. */
export function cookieName(policy: CookiePolicy, name: string): string {
  return `${namePrefix(policy)}${BASE}.${name}`;
}

export const sessionCookieName = (policy: CookiePolicy): string =>
  cookieName(policy, 'session_token');

/**
 * What better-auth's `advanced` options must hold for these names.
 *
 * better-auth puts `__Secure-` in front of every name when it is told to use secure cookies, and knows no `__Host-`. For
 * a host-only cookie its own prefix is therefore turned off, the prefix is part of the name it is given, and `Secure` is
 * set by hand. Everything else it sets (`Path=/`, `HttpOnly`, `SameSite=Lax`, no `Domain` while the cookie domain is
 * unset) already meets what a `__Host-` cookie needs.
 */
export function advancedCookieOptions(policy: CookiePolicy): {
  useSecureCookies: boolean;
  cookiePrefix?: string;
  defaultCookieAttributes?: { secure: true };
} {
  if (namePrefix(policy) === '__Host-') {
    return {
      useSecureCookies: false,
      cookiePrefix: `__Host-${BASE}`,
      defaultCookieAttributes: { secure: true },
    };
  }
  return { useSecureCookies: policy.secure };
}

/**
 * Every name the session cache cookie can have, under any policy, for clearing it. The cache is off and none is set
 * now, but a profile change clears it under all of them, so turning it on cannot bring stale values back.
 */
export function sessionCacheCookieNames(): string[] {
  return (['', '__Secure-', '__Host-'] as const).map((prefix) => `${prefix}${BASE}.session_data`);
}

/**
 * The attributes a cookie is removed with. A browser ignores the removal of a prefixed cookie unless it meets the
 * prefix's rules, so `__Host-` and `__Secure-` ones are `Secure`, and a `__Host-` one never has a `Domain`.
 */
export function removalAttributes(
  name: string,
  domain: string | undefined,
): { maxAge: 0; path: '/'; secure?: true; domain?: string } {
  return {
    maxAge: 0,
    path: '/',
    ...(name.startsWith('__') ? { secure: true as const } : {}),
    ...(domain !== undefined && !name.startsWith('__Host-') ? { domain } : {}),
  };
}
