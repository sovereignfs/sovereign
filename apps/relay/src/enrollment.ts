import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { enrollmentSecret } from './config';

/**
 * Enrollment tokens (RFC 0087's "Minimal, revocable per-instance
 * authentication"; leg 2's own design decision, resolving RFC 0087's
 * "Exact enrollment/key-rotation design" open question).
 *
 * **Deliberately stateless** — a self-verifying, HMAC-signed token (the same
 * three-part `header.payload.signature` shape as a JWT, hand-rolled with
 * `node:crypto` rather than a library, matching RFC 0087's "no exotic
 * cross-platform crypto library dependency needed"). `/v1/push` verifies the
 * signature alone; there is no per-instance row to look up, matching this
 * service's "no persistent state beyond what a feature strictly needs" design
 * principle — RFC 0087 states push needs none.
 *
 * **Revocation model:** coarse, by design. There is no per-instance
 * denylist — building one would reintroduce the persistent state this
 * design avoids, for a capability ("ability to use this relay," not access
 * to user data) whose abuse-prevention bar is deliberately low. The
 * available lever is rotating `RELAY_ENROLLMENT_SECRET`, which invalidates
 * every enrolled instance's token at once — blunt, but simple, and
 * consistent with "basic abuse prevention... not strong authorization."
 * Revisit if a real incident ever needs finer-grained revocation.
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
