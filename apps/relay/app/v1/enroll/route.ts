import { NextResponse } from 'next/server';
import { enrollmentConfigured } from '../../../src/config';
import { issueEnrollmentToken } from '../../../src/enrollment';
import { checkEnrollRateLimit, clientIp } from '../../../src/rate-limit';

/**
 * One-time enrollment: issues a per-instance API key used to authenticate
 * subsequent `/v1/push` calls. See RFC 0087's "Relay authentication" section
 * and `../../../src/enrollment.ts` for the (deliberately minimal — abuse
 * prevention, not strong authorization) design intent, and why the issued
 * token is self-verifying rather than looked up against stored state.
 *
 * No request body needed — the relay generates the instance id itself
 * (`issueEnrollmentToken`), so there is nothing for a caller to supply.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!enrollmentConfigured()) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Relay enrollment is not configured on this relay.' },
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
