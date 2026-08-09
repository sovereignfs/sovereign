import { connect, type ClientHttp2Session } from 'node:http2';
import { createSign } from 'node:crypto';
import { apnsConfig, type ApnsConfig } from './config';

/**
 * APNs provider API client (RFC 0087's "The relay push endpoint").
 *
 * **Uses `node:http2` directly, not `fetch()`.** Apple's provider API
 * requires a genuine HTTP/2 connection (ALPN `h2`) — verified against
 * Apple's own documentation, not assumed; Node's built-in `fetch` (undici)
 * does not negotiate HTTP/2 by default. `node:http2`'s client API needs no
 * extra dependency.
 *
 * The JWT signing (ES256, `node:crypto`) was verified empirically before
 * this file was written: `dsaEncoding: 'ieee-p1363'` produces the raw
 * 64-byte r‖s signature JWS requires, not the default DER/ASN.1 encoding a
 * bare `sign()` call would produce — confirmed by signing and verifying a
 * throwaway P-256 keypair, and confirmed a PEM string (the `.p8` file's own
 * format) works directly as the `key` input, matching how `APNS_KEY` is
 * actually supplied (env var, PEM content verbatim).
 */

let cachedToken: { jwt: string; issuedAt: number; keyId: string; teamId: string } | undefined;

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** Apple's guidance: a provider token is valid up to 60 minutes; regenerate
 *  well before that, not on every request. */
const TOKEN_LIFETIME_SECONDS = 55 * 60;

/** @internal exported for direct unit testing of JWT construction/caching —
 *  not part of this module's public API for production callers. */
export function apnsJwt(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedToken &&
    cachedToken.keyId === config.keyId &&
    cachedToken.teamId === config.teamId &&
    now - cachedToken.issuedAt < TOKEN_LIFETIME_SECONDS
  ) {
    return cachedToken.jwt;
  }

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const payload = base64url(JSON.stringify({ iss: config.teamId, iat: now }));
  const signingInput = `${header}.${payload}`;
  const sign = createSign('SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign({ key: config.key, dsaEncoding: 'ieee-p1363' });
  const jwt = `${signingInput}.${signature.toString('base64url')}`;

  cachedToken = { jwt, issuedAt: now, keyId: config.keyId, teamId: config.teamId };
  return jwt;
}

/** @internal test-only reset — the module-level token cache would otherwise
 *  leak state between test cases. */
export function resetApnsTokenCache(): void {
  cachedToken = undefined;
}

export type ApnsSendResult = 'sent' | 'invalid_token' | 'failed';

interface ApnsErrorBody {
  reason?: string;
}

/**
 * Forwards an already-encrypted payload to one APNs device token. Never
 * inspects `encryptedPayload` beyond placing it in the outer JSON envelope —
 * the `aps.alert` is a placeholder (a non-empty title is required for a
 * background-app-state push to display at all) and `mutable-content: 1` is
 * what lets `sovereign-mobile`'s iOS Notification Service Extension (leg 4)
 * intercept and decrypt it before the OS shows a banner.
 *
 * `topic` is the `apns-topic` header value — the app identity's bundle ID.
 * Passed explicitly rather than read from `config.bundleId` internally so
 * this function has no notion of "which platform": iOS and macOS share one
 * Apple Developer Team and JWT credential but use distinct bundle IDs, and
 * the caller (the push route) is what knows which platform a given device
 * token belongs to — see RFC 0087's "Desktop native push" addendum.
 *
 * `originOverride` exists solely so tests can point this at a real local
 * `node:http2` server rather than mocking the transport — see
 * `__tests__/apns.test.ts`. Never set outside tests; production always
 * derives the origin from `APNS_USE_SANDBOX`.
 */
export function sendApnsPush(
  deviceToken: string,
  encryptedPayload: string,
  topic: string,
  originOverride?: string,
): Promise<ApnsSendResult> {
  const config = apnsConfig();
  const host = config.useSandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const origin = originOverride ?? `https://${host}`;
  const body = JSON.stringify({
    aps: { 'mutable-content': 1, alert: { title: ' ' }, sound: 'default' },
    encryptedPayload,
  });

  return new Promise((resolve, reject) => {
    let client: ClientHttp2Session;
    try {
      client = connect(origin);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    let settled = false;
    const finish = (result: ApnsSendResult | Error) => {
      if (settled) return;
      settled = true;
      client.close();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    client.on('error', (err) => finish(err));

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${apnsJwt(config)}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    req.on('error', (err) => finish(err));

    let status = 0;
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0);
    });

    let responseBody = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      responseBody += chunk;
    });
    req.on('end', () => {
      if (status === 200) {
        finish('sent');
        return;
      }
      let parsed: ApnsErrorBody = {};
      try {
        parsed = JSON.parse(responseBody) as ApnsErrorBody;
      } catch {
        // Non-JSON error body — fall through to the generic failure below.
      }
      if (parsed.reason === 'BadDeviceToken' || parsed.reason === 'Unregistered') {
        finish('invalid_token');
        return;
      }
      finish('failed');
    });

    req.end(body);
  });
}
