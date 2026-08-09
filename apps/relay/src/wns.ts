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
 * Matches `notify.windows.com` itself or any depth of subdomain under it
 * (`db5.notify.windows.com`, `bn1.notify.windows.com`, ...) — every
 * documented WNS channel URI lives there, so this is the allowlist, not a
 * denylist of known-bad hosts. Anchored on both ends against the already-
 * parsed `hostname` (never the raw URL string), so a lookalike like
 * `notify.windows.com.attacker.example.com` or
 * `evil.notify.windows.com.attacker.example.com` correctly fails to match.
 */
const WNS_CHANNEL_HOST_PATTERN = /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/;

/**
 * True only for a genuine Microsoft WNS channel URI — `sendWnsPush` below
 * duplicates this exact check inline rather than calling this function,
 * see its own comment for why. Exported only so the predicate itself is
 * independently unit-testable; not otherwise called in production code.
 */
export function isValidWnsChannelUri(channelUri: string): boolean {
  let url: URL;
  try {
    url = new URL(channelUri);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && WNS_CHANNEL_HOST_PATTERN.test(url.hostname);
}

/**
 * Forwards an already-encrypted payload as a raw WNS notification directly
 * to the device's channel URI. WNS has no separate opaque device-token
 * concept the way APNs/FCM do — the channel URI itself, generated
 * client-side by Windows, is what `push_device_tokens.device_token` stores
 * for `'windows'` rows, and is a full HTTPS endpoint this function POSTs to
 * directly rather than a host + path pair.
 *
 * **The host/scheme check right below is deliberately inlined here, not
 * delegated to `isValidWnsChannelUri` above**, even though the logic is
 * identical: unlike APNs/FCM, where the destination host is always a fixed
 * Apple/Google API endpoint, `channelUri` here is ultimately client-
 * supplied (via `push_device_tokens.device_token`, from whichever
 * self-hosted instance called `/v1/push`). Without this check, a malicious
 * or compromised instance could point it at an internal address the relay
 * can reach (a cloud metadata endpoint, an internal service) and use this
 * relay as an authenticated SSRF proxy.
 *
 * GitHub's CodeQL SSRF analysis (`js/request-forgery`) took three attempts
 * to satisfy on this function, all logically equivalent, verified against
 * the same PR (#388):
 *   1. Guarding via a call to the separate `isValidWnsChannelUri` function
 *      above — not recognized; CodeQL's taint tracking doesn't treat a
 *      boolean returned from another function as a sanitizer.
 *   2. Guarding inline with `url.hostname !== '...' && !url.hostname
 *      .endsWith('...')`, then passing the parsed `URL` object (not the
 *      original string) to `fetch()` — still not recognized, even inlined
 *      and even with the sanitized object (not the raw string) reaching
 *      the sink.
 *   3. This version: a single `RegExp#test()` call against `hostname` —
 *      CodeQL's standard sanitizer-guard recognition specifically models
 *      `RegExp#test()` as a barrier for tainted string flow, unlike
 *      `.endsWith()`/compound boolean expressions. If a future edit
 *      "simplifies" this back to a compound boolean, expect the same
 *      finding to return — verify against a real CodeQL run before
 *      assuming a refactor here is safe.
 */
export async function sendWnsPush(
  channelUri: string,
  encryptedPayload: string,
): Promise<WnsSendResult> {
  let parsedChannelUri: URL;
  try {
    parsedChannelUri = new URL(channelUri);
  } catch {
    return 'invalid_token';
  }
  if (
    parsedChannelUri.protocol !== 'https:' ||
    !WNS_CHANNEL_HOST_PATTERN.test(parsedChannelUri.hostname)
  ) {
    return 'invalid_token';
  }

  const config = wnsConfig();
  const token = await wnsAccessToken(config);

  const res = await fetch(parsedChannelUri, {
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
