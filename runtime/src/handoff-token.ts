import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Handoff token issuance/verification (RFC 0053). Same
 * `base64url(json) + "." + HMAC-SHA256` shape as `./connections.ts`'s OAuth
 * state token — reused pattern, not a new format.
 *
 * Unlike the OAuth state token (and, on the leg-4 branch not present here,
 * `tool-confirmation.ts`), there is **no in-memory single-use tracking**
 * here — the token carries only an opaque `handoffId`; the payload and the
 * single-use claim both live in the `plugin_handoffs` DB row
 * (`packages/db`'s `createPluginHandoff`/`consumePluginHandoff`), which is
 * durable and correct under multiple runtime processes. An in-memory Map
 * would be redundant with that row and wrong under horizontal scaling —
 * this token's own job is only "was this signed by the platform, for this
 * exact provider+name, and not yet expired," nothing more.
 */

const TOKEN_VERSION = 'ho1';
const TOKEN_SECRET_ENV = ['SOVEREIGN_AUTH_SECRET', 'AUTH_SECRET'] as const;

interface HandoffTokenPayload {
  version: typeof TOKEN_VERSION;
  handoffId: string;
  providerId: string;
  name: string;
  expiresAt: number;
}

function tokenSecret(): string {
  for (const key of TOKEN_SECRET_ENV) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error('SOVEREIGN_AUTH_SECRET or AUTH_SECRET is required for handoff token signing.');
}

function sign(payload: string): string {
  return createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * `expiresAt` is taken as-is (a Unix-seconds timestamp), not computed here —
 * the caller (`runtime/src/sdk-host.ts`) already knows the exact value from
 * the `plugin_handoffs` row it just wrote, and signing that same value
 * guarantees the token and the row can never disagree about when the
 * handoff expires (two independent `Date.now()`-based TTL computations
 * would risk a few milliseconds of drift between them).
 */
export function createHandoffToken(input: {
  handoffId: string;
  providerId: string;
  name: string;
  expiresAt: number;
}): string {
  const payload: HandoffTokenPayload = {
    version: TOKEN_VERSION,
    handoffId: input.handoffId,
    providerId: input.providerId,
    name: input.name,
    expiresAt: input.expiresAt,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verify a handoff token's signature, expiry, and provider/name binding.
 * Returns the opaque `handoffId` to look up (and atomically consume) in
 * `plugin_handoffs` — this function alone never touches the database, so it
 * cannot tell the caller whether the underlying row still exists or has
 * already been consumed; that's `consumePluginHandoff`'s job. Throws (never
 * returns a boolean) so every failure mode is distinctly diagnosable.
 */
export function verifyHandoffToken(
  token: string,
  expected: { providerId: string; name: string },
): { handoffId: string } {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new Error('Invalid handoff token signature.');
  }

  const parsed = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as HandoffTokenPayload;
  if (parsed.version !== TOKEN_VERSION) {
    throw new Error('Unsupported handoff token version.');
  }
  if (parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('Handoff token has expired.');
  }
  if (parsed.providerId !== expected.providerId) {
    throw new Error('Handoff token provider mismatch.');
  }
  if (parsed.name !== expected.name) {
    throw new Error('Handoff token name mismatch.');
  }

  return { handoffId: parsed.handoffId };
}
