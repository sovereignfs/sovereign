import { isIP } from 'node:net';
import { ConfigError, type Problem } from '@sovereignfs/config';
import type { CoreConfig } from '../config';
import { MAX_PASSWORD_LENGTH, type PasswordPolicy } from './password-policy';

export type AuthSettings = {
  /** Core's own public address; it is also the issuer and the base of every link. */
  baseUrl: string;
  secret: string;
  /** Extra origins accepted for requests, besides core's own. */
  trustedOrigins: string[];
  /** Parent domain for session cookies, or `undefined` for core's own host only. */
  cookieDomain: string | undefined;
  /** Reverse proxies whose `X-Forwarded-For` entries are skipped to find the client's address. */
  trustedProxies: string[];
  secureCookies: boolean;
  passwordPolicy: PasswordPolicy;
  /** Whether sign-in waits for the address to be verified (core-app §3.3.3). */
  requireEmailVerification: boolean;
};

const DOMAIN =
  /^\.?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * The authentication settings, from the environment, checked together. Every problem is reported
 * at once and none shows a value. The cookie domain must be a parent of core's own host, or the
 * browser would drop the cookie and nobody could sign in.
 */
export function resolveAuthSettings(config: CoreConfig, prefix = 'SV'): AuthSettings {
  const problems: Problem[] = [];
  const problem = (variable: string, message: string) =>
    problems.push({ variable: `${prefix}_${variable}`, message });
  const host = new URL(config.url).hostname;

  const trustedOrigins: string[] = [];
  config.authTrustedOrigins.forEach((entry, index) => {
    let origin: URL | undefined;
    try {
      origin = new URL(entry);
    } catch {
      origin = undefined;
    }
    const isOrigin =
      origin !== undefined &&
      (origin.protocol === 'https:' || origin.protocol === 'http:') &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash &&
      !origin.username &&
      !origin.password;
    if (!origin || !isOrigin) {
      problem(
        'AUTH_TRUSTED_ORIGINS',
        `entry ${index + 1} must be an origin such as https://app.example.com (no path)`,
      );
    } else {
      trustedOrigins.push(origin.origin);
    }
  });

  const trustedProxies: string[] = [];
  config.authTrustedProxies.forEach((entry, index) => {
    if (isAddressOrRange(entry)) trustedProxies.push(entry);
    else {
      problem(
        'AUTH_TRUSTED_PROXIES',
        `entry ${index + 1} must be an IP address or a range such as 10.0.0.0/8`,
      );
    }
  });

  let cookieDomain: string | undefined;
  const rawDomain = config.authCookieDomain;
  if (rawDomain !== undefined) {
    const domain = rawDomain.toLowerCase();
    if (!DOMAIN.test(domain)) {
      problem('AUTH_COOKIE_DOMAIN', 'must be a domain such as example.com');
    } else if (
      host !== domain.replace(/^\./, '') &&
      !host.endsWith(`.${domain.replace(/^\./, '')}`)
    ) {
      problem(
        'AUTH_COOKIE_DOMAIN',
        "must be core's own host or a parent of it, or browsers refuse the cookie",
      );
    } else {
      cookieDomain = domain.replace(/^\./, '');
    }
  }

  const passwordPolicy: PasswordPolicy = {
    minLength: config.authPasswordMinLength,
    maxLength: MAX_PASSWORD_LENGTH,
    requireUppercase: config.authPasswordRequireUppercase,
    requireLowercase: config.authPasswordRequireLowercase,
    requireNumber: config.authPasswordRequireNumber,
    requireSymbol: config.authPasswordRequireSymbol,
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return {
    baseUrl: config.url,
    secret: config.authSecret.reveal(),
    trustedOrigins,
    cookieDomain,
    trustedProxies,
    secureCookies: config.url.startsWith('https://'),
    passwordPolicy,
    requireEmailVerification: config.authRequireEmailVerification,
  };
}

/** `10.0.0.1`, `10.0.0.0/8`, `2001:db8::/32`: an address, optionally with a prefix that fits its family. */
function isAddressOrRange(entry: string): boolean {
  const [address = '', prefix, ...rest] = entry.split('/');
  const family = isIP(address);
  if (family === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}
