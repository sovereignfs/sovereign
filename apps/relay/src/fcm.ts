import { createSign } from 'node:crypto';
import { fcmServiceAccount, type FcmServiceAccount } from './config';

/**
 * FCM HTTP v1 API client (RFC 0087's "The relay push endpoint").
 *
 * Plain HTTPS/1.1 REST (unlike APNs — no HTTP/2 requirement), so `fetch()`
 * is correct here. Authenticates via a Google service-account OAuth2 JWT
 * bearer flow (RS256, `node:crypto`) — verified empirically before this file
 * was written that Node's `createSign('RSA-SHA256')` produces a standard
 * PKCS#1 v1.5 signature (256 bytes for a 2048-bit key), which is exactly
 * what JWT's RS256 expects, no special encoding option needed (unlike
 * ES256's `dsaEncoding: 'ieee-p1363'` in `./apns.ts`).
 */

let cachedAccessToken: { token: string; expiresAt: number; clientEmail: string } | undefined;

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** @internal test-only reset. */
export function resetFcmTokenCache(): void {
  cachedAccessToken = undefined;
}

async function fcmAccessToken(account: FcmServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedAccessToken &&
    cachedAccessToken.clientEmail === account.client_email &&
    now < cachedAccessToken.expiresAt - 60
  ) {
    return cachedAccessToken.token;
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(account.private_key).toString('base64url');
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`FCM OAuth2 token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
    clientEmail: account.client_email,
  };
  return data.access_token;
}

export type FcmSendResult = 'sent' | 'invalid_token' | 'failed';

interface FcmErrorBody {
  error?: { status?: string };
}

/**
 * Forwards an already-encrypted payload to one FCM registration token, as a
 * data-only message (no `notification` block) — Android decrypts and
 * displays it inline in the `FirebaseMessagingService` background handler
 * (leg 4), no separate extension needed the way iOS's Notification Service
 * Extension is.
 */
export async function sendFcmPush(
  deviceToken: string,
  encryptedPayload: string,
): Promise<FcmSendResult> {
  const account = fcmServiceAccount();
  if (!account) throw new Error('FCM is not configured (FCM_SERVICE_ACCOUNT_JSON)');

  const accessToken = await fcmAccessToken(account);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          data: { encryptedPayload },
          android: { priority: 'high' },
        },
      }),
    },
  );
  if (res.ok) return 'sent';

  let parsed: FcmErrorBody = {};
  try {
    parsed = (await res.json()) as FcmErrorBody;
  } catch {
    // Non-JSON error body — fall through to the generic failure below.
  }
  const status = parsed.error?.status;
  if (status === 'UNREGISTERED' || status === 'NOT_FOUND' || status === 'INVALID_ARGUMENT') {
    return 'invalid_token';
  }
  return 'failed';
}
