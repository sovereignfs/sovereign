import { NextResponse } from 'next/server';
import { enrollmentConfigured } from '../../../src/config';
import { issueEnrollmentToken } from '../../../src/enrollment';
import { checkEnrollRateLimit, clientIp } from '../../../src/rate-limit';

/**
 * One-time enrollment: issues a token used to authenticate subsequent
 * `/api/chat` calls. Mirrors apps/relay's `/v1/enroll` exactly (RFC 0063 §4
 * / epic task 22.2 — "reuse apps/relay/src/enrollment.ts's signed-token
 * pattern... do not invent a new mechanism").
 *
 * No request body needed — this service generates the instance id itself.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!enrollmentConfigured()) {
    return NextResponse.json(
      {
        error: 'not_configured',
        message: 'apps/harness enrollment is not configured on this instance.',
      },
      { status: 503 },
    );
  }

  const ip = clientIp(request);
  const limit = checkEnrollRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many enrollment attempts.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const { instanceId, token } = issueEnrollmentToken();
  return NextResponse.json({ instanceId, instanceKey: token });
}
