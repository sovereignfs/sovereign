import { randomBytes } from 'node:crypto';
import { deviceCookieName } from '../auth/cookies';

export { deviceCookieName };

/**
 * The device a lock is set on is the browser (RFC 0006 B1): a random id in a long-lived, host-only cookie, which says nothing of the
 * person and opens nothing; it only names which lock setting applies (`deviceCookieName`).
 */

/** How long the cookie is kept: the longest a browser keeps one (400 days). */
export const DEVICE_COOKIE_SECONDS = 400 * 24 * 60 * 60;

/** A new device id: 16 random bytes, base64url. */
export const newDeviceId = (): string => randomBytes(16).toString('base64url');

/** The device id in a `Cookie` header, when there is one that looks like one. */
export function deviceIdFrom(cookieHeader: string | null, secure: boolean): string | undefined {
  if (!cookieHeader) return undefined;
  const name = deviceCookieName(secure);
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    return /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : undefined;
  }
  return undefined;
}
