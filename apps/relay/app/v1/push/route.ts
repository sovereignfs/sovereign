import { NextResponse } from 'next/server';
import { sendApnsPush } from '../../../src/apns';
import { apnsConfigured, enrollmentConfigured, fcmConfigured } from '../../../src/config';
import { verifyEnrollmentToken } from '../../../src/enrollment';
import { sendFcmPush } from '../../../src/fcm';
import { checkPushRateLimit } from '../../../src/rate-limit';

/**
 * Forwards an already-encrypted push payload to APNs or FCM, using this
 * service's own Apple/Firebase credentials. Never inspects, logs, or is
 * otherwise capable of accessing the plaintext content — see RFC 0087's
 * "The relay service" section for why that guarantee is this route's whole
 * reason to exist. `encryptedPayload` is placed directly into the outer
 * platform envelope (`../../../src/apns.ts` / `./fcm.ts`) and never parsed.
 *
 * Contract per RFC 0087: `{deviceToken, platform, encryptedPayload,
 * instanceKey}`.
 */

interface PushRequestBody {
  deviceToken?: unknown;
  platform?: unknown;
  encryptedPayload?: unknown;
  instanceKey?: unknown;
}

function isValidBody(body: PushRequestBody): body is {
  deviceToken: string;
  platform: 'ios' | 'android';
  encryptedPayload: string;
  instanceKey: string;
} {
  return (
    typeof body.deviceToken === 'string' &&
    body.deviceToken.length > 0 &&
    (body.platform === 'ios' || body.platform === 'android') &&
    typeof body.encryptedPayload === 'string' &&
    body.encryptedPayload.length > 0 &&
    typeof body.instanceKey === 'string' &&
    body.instanceKey.length > 0
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!enrollmentConfigured()) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Relay enrollment is not configured on this relay.' },
      { status: 503 },
    );
  }

  let body: PushRequestBody;
  try {
    body = (await request.json()) as PushRequestBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Malformed JSON body.' },
      {
        status: 400,
      },
    );
  }
  if (!isValidBody(body)) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: 'Expected {deviceToken, platform, encryptedPayload, instanceKey}.',
      },
      { status: 400 },
    );
  }

  const identity = verifyEnrollmentToken(body.instanceKey);
  if (!identity) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'instanceKey is missing, malformed, or invalid.' },
      { status: 401 },
    );
  }

  const limit = checkPushRateLimit(identity.instanceId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many push requests from this instance.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (body.platform === 'ios') {
    if (!apnsConfigured()) {
      return NextResponse.json(
        { error: 'platform_not_configured', message: 'APNs is not configured on this relay.' },
        { status: 503 },
      );
    }
    try {
      const result = await sendApnsPush(body.deviceToken, body.encryptedPayload);
      return NextResponse.json({ result });
    } catch (err) {
      return NextResponse.json(
        { error: 'send_failed', message: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
  }

  if (!fcmConfigured()) {
    return NextResponse.json(
      { error: 'platform_not_configured', message: 'FCM is not configured on this relay.' },
      { status: 503 },
    );
  }
  try {
    const result = await sendFcmPush(body.deviceToken, body.encryptedPayload);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: 'send_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
