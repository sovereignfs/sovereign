import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { enrollmentSecret } from './config';

/**
 * Enrollment tokens — the trust boundary between `apps/harness` and
 * Warden's server-side code (RFC 0063 §4, epic task 22.2). Reuses
 * `apps/relay/src/enrollment.ts`'s exact signed-token pattern rather than
 * inventing a new mechanism, per that task's explicit instruction: the same
 * self-verifying, HMAC-signed `header.payload.signature` shape, hand-rolled
 * with `node:crypto`, no persistent state, revocation via secret rotation.
 *
 * The scenario differs from `apps/relay`'s (many remote self-hosted
 * instances enrolling with one shared, centrally-run service) — here there
 * is exactly one caller (this instance's own runtime/Warden code) talking
 * to exactly one `apps/harness` over a private Docker network. The
 * mechanism is reused as-is anyway: it costs nothing extra, and keeping the
 * shape identical means a future genuinely-remote consumer (should one ever
 * exist) needs no redesign.
 */

interface EnrollmentPayload {
  instanceId: string;
  iat: number;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(signingInput: string): string {
  return createHmac('sha256', enrollmentSecret()).update(signingInput).digest('base64url');
}

/** Issues a new enrollment token for a freshly-generated instance id. */
export function issueEnrollmentToken(): { instanceId: string; token: string } {
  const instanceId = randomUUID();
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ instanceId, iat: Math.floor(Date.now() / 1000) } satisfies EnrollmentPayload),
  );
  const signingInput = `${header}.${payload}`;
  return { instanceId, token: `${signingInput}.${sign(signingInput)}` };
}

/** Verifies a token's signature and shape. Returns `null` on any failure —
 *  malformed, wrong secret (rotated or forged), or truncated. Never throws
 *  on attacker-controlled input. */
export function verifyEnrollmentToken(token: string): { instanceId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];

  let expected: Buffer;
  try {
    expected = Buffer.from(sign(`${header}.${payload}`), 'base64url');
  } catch {
    return null;
  }
  const actual = Buffer.from(signature, 'base64url');
  // Length must match before timingSafeEqual — it throws on mismatched
  // buffer lengths rather than returning false.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'instanceId' in decoded &&
      typeof (decoded as EnrollmentPayload).instanceId === 'string'
    ) {
      return { instanceId: (decoded as EnrollmentPayload).instanceId };
    }
    return null;
  } catch {
    return null;
  }
}
