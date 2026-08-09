import { wnsConfig, type WnsConfig } from './config';

/**
 * WNS (Windows Notification Service) raw-notification client (RFC 0087's
 * "Desktop native push" addendum, workstream 0010 leg 2).
 *
 * **Raw notifications only, deliberately** — see the addendum for the full
 * reasoning. WNS's other notification type ("toast") can render a system
 * banner even while the app is fully quit, but only because Windows itself
 * renders it from plaintext XML in the push body; there's no app code
 * running on a quit, unpackaged app to decrypt anything first. That
 * conflicts with this RFC's content-blind guarantee, so it's rejected.
 * Raw notifications (`X-WNS-Type: wns/raw`) stay end-to-end encrypted, at
 * the cost of only reaching a *running* Windows process (tray-resident is
 * sufficient) — never a fully-quit one.
 *
 * Plain HTTPS/1.1 (like `./fcm.ts`, unlike APNs's HTTP/2 requirement), so
 * `fetch()` is correct here. The OAuth2 token endpoint
 * (`https://login.live.com/accesstoken.srf`) responds
 * `application/x-www-form-urlencoded`, not JSON — unlike FCM's OAuth2
 * token endpoint — per Microsoft's documented WNS authentication contract.
 * **Not verified against a real Package SID/secret or a real channel URI**
 * — no Partner Center credentials are available in this environment; see
 * RFC 0087's addendum's "Open questions."
 */

let cachedToken: { token: string; expiresAt: number; packageSid: string } | undefined;

/** @internal test-only reset — the module-level token cache would otherwise
 *  leak state between test cases. */
export function resetWnsTokenCache(): void {
  cachedToken = undefined;
}

/** Microsoft's documented default lifetime is ~24h; refresh proactively
 *  rather than waiting for a 401, mirroring `./apns.ts`'s `apnsJwt` and
 *  `./fcm.ts`'s `fcmAccessToken` caching shape. */
async function wnsAccessToken(config: WnsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedToken &&
    cachedToken.packageSid === config.packageSid &&
    now < cachedToken.expiresAt - 60
  ) {
    return cachedToken.token;
  }

  const res = await fetch('https://login.live.com/accesstoken.srf', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.packageSid,
      client_secret: config.clientSecret,
      scope: 'notify.windows.com',
    }),
  });
  if (!res.ok) {
    throw new Error(`WNS OAuth2 token exchange failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.text();
  const parsed = new URLSearchParams(body);
  const token = parsed.get('access_token');
  const expiresIn = Number(parsed.get('expires_in') ?? '0');
  if (!token) {
    throw new Error(`WNS OAuth2 token response missing access_token: ${body}`);
  }

  cachedToken = { token, expiresAt: now + expiresIn, packageSid: config.packageSid };
  return token;
}

export type WnsSendResult = 'sent' | 'invalid_token' | 'failed';

/**
 * Forwards an already-encrypted payload as a raw WNS notification directly
 * to the device's channel URI. WNS has no separate opaque device-token
 * concept the way APNs/FCM do — the channel URI itself, generated
 * client-side by Windows, is what `push_device_tokens.device_token` stores
 * for `'windows'` rows, and is a full HTTPS endpoint this function POSTs to
 * directly rather than a host + path pair.
 *
 * Response codes per Microsoft's documented WNS contract: `200` is success;
 * `404`/`410` mean the channel is gone (app uninstalled, or the channel's
 * own undocumented lifetime lapsed) — pruned the same way an APNs/FCM
 * invalid token is. Anything else (including a `401` from an unexpectedly
 * expired token) is `'failed'`, not retried inline — this leg's own scope
 * stays at "forward the payload," matching `./apns.ts`/`./fcm.ts`'s own
 * restraint against building retry logic prematurely.
 */
export async function sendWnsPush(
  channelUri: string,
  encryptedPayload: string,
): Promise<WnsSendResult> {
  const config = wnsConfig();
  const token = await wnsAccessToken(config);

  const res = await fetch(channelUri, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
      'x-wns-type': 'wns/raw',
    },
    body: encryptedPayload,
  });

  if (res.ok) return 'sent';
  if (res.status === 404 || res.status === 410) return 'invalid_token';
  return 'failed';
}
