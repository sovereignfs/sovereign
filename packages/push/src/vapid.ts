import { sign } from 'node:crypto';
import { fromBase64Url, toBase64Url, utf8 } from './bytes.js';
import { signingKeyOf } from './keys.js';
import type { PushSettings } from './settings.js';

/** How long a signed token is good for. RFC 8292 §2 allows 24 hours; Apple's push service wants no more than one. */
export const TOKEN_LIFETIME_SECONDS = 60 * 60;

const json = (value: unknown) => toBase64Url(utf8(JSON.stringify(value)));

/**
 * The `Authorization` header of a push (RFC 8292 §3): `vapid t=<JWT>, k=<public key>`. The JWT is ES256, its `aud` the endpoint's
 * origin, its `exp` an hour from `now`, its `sub` the app's contact.
 */
export function vapidAuthorization(endpoint: string, settings: PushSettings, now: number): string {
  const scalar = fromBase64Url(settings.privateKey);
  if (!scalar) throw new Error('the push key is not URL-safe base64');
  const header = json({ typ: 'JWT', alg: 'ES256' });
  const claims = json({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS,
    sub: settings.subject,
  });
  const input = `${header}.${claims}`;
  const signature = sign('sha256', utf8(input), {
    key: signingKeyOf(scalar),
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${input}.${toBase64Url(signature)}, k=${settings.publicKey}`;
}
