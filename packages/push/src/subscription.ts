import { fromBase64Url } from './bytes.js';

/** A browser's subscription, as the package keeps it: the push service's address for the device, and the two keys. */
export interface Subscription {
  /** An `https` address of a push service, at most 2048 characters. */
  readonly endpoint: string;
  /** The browser's public key: an uncompressed P-256 point, 65 bytes in URL-safe base64. */
  readonly p256dh: string;
  /** The subscription's authentication secret, 16 bytes in URL-safe base64. */
  readonly auth: string;
}

/**
 * The push services browsers use (RFC 0009 §1.2). A subscription to any other host is refused, and nothing is sent anywhere else.
 * `*.` matches any name below the domain, not the domain itself. An app that must reach another service passes its own list,
 * built from this one.
 */
export const PUSH_SERVICE_HOSTS: readonly string[] = [
  // Chrome, Edge and other Chromium browsers (Firebase Cloud Messaging), and its older address.
  'fcm.googleapis.com',
  'android.googleapis.com',
  // Firefox.
  'updates.push.services.mozilla.com',
  '*.push.services.mozilla.com',
  // Safari, and every browser on iPhone and iPad.
  'web.push.apple.com',
  '*.push.apple.com',
  // Edge on Windows.
  '*.notify.windows.com',
];

export const MAX_ENDPOINT_LENGTH = 2048;

const hostMatches = (host: string, pattern: string) => {
  if (!pattern.startsWith('*.')) return host === pattern;
  const domain = pattern.slice(1); // ".push.apple.com"
  return host.length > domain.length && host.endsWith(domain);
};

/**
 * Whether an address is one push may be sent to: `https`, on the default port, with no user or password, at a host on the list.
 * Checked when a subscription is saved and again before every send.
 */
export function isPushServiceEndpoint(
  endpoint: string,
  hosts: readonly string[] = PUSH_SERVICE_HOSTS,
): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '')
    return false;
  const host = url.hostname.toLowerCase();
  return hosts.some((pattern) => hostMatches(host, pattern.toLowerCase()));
}

export type ParsedSubscription =
  | { readonly ok: true; readonly subscription: Subscription }
  | { readonly ok: false; readonly reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What `PushSubscription.toJSON()` gives, and nothing more: `endpoint`, `keys.p256dh` (65 bytes, an uncompressed point),
 * `keys.auth` (16 bytes) and an optional `expirationTime`. The reason names a field, never its value.
 */
export function parseSubscription(
  value: unknown,
  options: { readonly hosts?: readonly string[] } = {},
): ParsedSubscription {
  if (!isRecord(value)) return { ok: false, reason: 'not a subscription' };
  const { endpoint, keys, expirationTime, ...rest } = value;
  if (Object.keys(rest).length > 0)
    return { ok: false, reason: 'has fields a subscription does not' };
  if (expirationTime !== undefined && expirationTime !== null && typeof expirationTime !== 'number')
    return { ok: false, reason: 'expirationTime is not a time' };
  if (typeof endpoint !== 'string' || !isPushServiceEndpoint(endpoint, options.hosts))
    return { ok: false, reason: 'endpoint is not a known push service' };
  if (!isRecord(keys)) return { ok: false, reason: 'keys are missing' };
  const { p256dh, auth, ...more } = keys;
  if (Object.keys(more).length > 0) return { ok: false, reason: 'keys has more than two fields' };
  const point = fromBase64Url(p256dh);
  if (!point || point.length !== 65 || point[0] !== 0x04)
    return { ok: false, reason: 'keys.p256dh is not a public key' };
  const secret = fromBase64Url(auth);
  if (!secret || secret.length !== 16)
    return { ok: false, reason: 'keys.auth is not an auth secret' };
  return {
    ok: true,
    subscription: { endpoint, p256dh: p256dh as string, auth: auth as string },
  };
}
