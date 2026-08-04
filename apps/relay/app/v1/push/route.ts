import { NextResponse } from 'next/server';

/**
 * Forwards an already-encrypted push payload to APNs or FCM, using this
 * service's own Apple/Firebase credentials. Never inspects, logs, or is
 * otherwise capable of accessing the plaintext content — see RFC 0087's
 * "The relay service" section for why that guarantee is this route's whole
 * reason to exist.
 *
 * Not yet implemented — workstream 0005 leg 2. This stub exists so the
 * route path and request/response shape are fixed ahead of that leg, per
 * RFC 0087's `{deviceToken, platform, encryptedPayload, instanceKey}`
 * contract.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: 'not_implemented',
      message: 'Push relay is not yet implemented — see RFC 0087, workstream 0005 leg 2.',
    },
    { status: 501 },
  );
}
