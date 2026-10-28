import { isIP } from 'node:net';
import { ConfigError, type Problem } from '@sovereignfs/config';
import { getConfig, type CoreConfig } from '../config';
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
  /** Passkeys (core-app §3.4.2): the domain they are bound to, the name devices show, and where they may be used. */
  webauthn: { rpId: string; rpName: string; origins: string[] };
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
    const origin = parseOrigin(entry);
    if (!origin) {
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

  const webauthn = resolveWebauthn(config, host, problem);

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
    webauthn,
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

/**
 * The authentication settings, from the environment. Throws a `ConfigError` naming what is wrong.
 * Here, not with `getAuth`, so a page that only needs the password rules does not load better-auth.
 */
export function getAuthSettings(): AuthSettings {
  return resolveAuthSettings(getConfig());
}

/** `value` as an origin (scheme and host, no path, query or credentials), or `undefined` when it is not one. */
function parseOrigin(value: string): URL | undefined {
  let origin: URL | undefined;
  try {
    origin = new URL(value);
  } catch {
    return undefined;
  }
  const isOrigin =
    (origin.protocol === 'https:' || origin.protocol === 'http:') &&
    origin.pathname === '/' &&
    !origin.search &&
    !origin.hash &&
    !origin.username &&
    !origin.password;
  return isOrigin ? origin : undefined;
}

/** Whether `host` is `domain` or a subdomain of it. */
const isWithin = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Browsers use passkeys only on https, and on localhost for development. */
const isSecureContext = (origin: URL) =>
  origin.protocol === 'https:' ||
  origin.hostname === 'localhost' ||
  origin.hostname.endsWith('.localhost');

/**
 * The relying party for passkeys, from the environment (core-app §3.4.2). Unset, it is core's own host
 * and address. A domain must be core's host or a parent of it, and every origin must sit on that domain
 * and be one a browser will use passkeys on, or no passkey could ever be made: that is reported at
 * start-up rather than found by the first person to try.
 */
function resolveWebauthn(
  config: CoreConfig,
  host: string,
  problem: (variable: string, message: string) => void,
): AuthSettings['webauthn'] {
  let rpId = host;
  if (config.authWebauthnRpId !== undefined) {
    const given = config.authWebauthnRpId.toLowerCase();
    if (!DOMAIN.test(given) || given.startsWith('.')) {
      problem('AUTH_WEBAUTHN_RP_ID', 'must be a domain such as example.com');
    } else if (!isWithin(host, given)) {
      problem(
        'AUTH_WEBAUTHN_RP_ID',
        "must be core's own host or a parent of it, or browsers refuse every passkey",
      );
    } else {
      rpId = given;
    }
  }

  const origins: string[] = [];
  config.authWebauthnOrigin.forEach((entry, index) => {
    const origin = parseOrigin(entry);
    if (!origin) {
      problem(
        'AUTH_WEBAUTHN_ORIGIN',
        `entry ${index + 1} must be an origin such as https://core.example.com (no path)`,
      );
    } else if (!isSecureContext(origin)) {
      problem(
        'AUTH_WEBAUTHN_ORIGIN',
        `entry ${index + 1} must be https: browsers refuse passkeys on http`,
      );
    } else if (!isWithin(origin.hostname, rpId)) {
      problem(
        'AUTH_WEBAUTHN_ORIGIN',
        `entry ${index + 1} must be on ${rpId} or a subdomain of it, or browsers refuse its passkeys`,
      );
    } else {
      origins.push(origin.origin);
    }
  });
  if (config.authWebauthnOrigin.length === 0) origins.push(new URL(config.url).origin);

  return { rpId, rpName: config.authWebauthnRpName?.trim() || 'Sovereign', origins };
}
