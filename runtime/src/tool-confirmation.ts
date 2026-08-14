import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Confirmation-token issuance/verification for plugin tool contracts (RFC
 * 0047). Modeled directly on `./connections.ts`'s OAuth state token (same
 * `base64url(json) + "." + HMAC-SHA256` shape, same TTL-clamp and
 * single-use-via-in-memory-Map pattern) — the codebase's one established
 * convention for a short-lived, actor-bound, signed token, reused rather
 * than inventing a second format (e.g. a JWT library).
 *
 * Additionally binds an `inputHash` — RFC 0047 requires "if input changes
 * after preview, the confirmation token is invalid," which neither existing
 * precedent (OAuth state, storage signed URL) needed.
 *
 * Single-use tracking is process-local (an in-memory `Map`, swept on read)
 * — same accepted tradeoff as the OAuth state token: fine for a token this
 * short-lived, but does not survive a horizontally-scaled multi-process
 * deployment. Sovereign runtime is single-process today.
 */

const TOKEN_VERSION = 'st1';
const DEFAULT_TOKEN_TTL_SECONDS = 5 * 60;
const MAX_TOKEN_TTL_SECONDS = 15 * 60;
const TOKEN_SECRET_ENV = ['SOVEREIGN_AUTH_SECRET', 'AUTH_SECRET'] as const;
const USED_TOKEN_KEY = Symbol.for('@sovereignfs/runtime:used-tool-confirmation-tokens');

interface TokenPayload {
  version: typeof TOKEN_VERSION;
  actorUserId: string;
  callerPluginId: string;
  providerId: string;
  tool: string;
  inputHash: string;
  nonce: string;
  expiresAt: number;
}

interface UsedTokenHolder {
  [USED_TOKEN_KEY]?: Map<string, number>;
}

function usedTokens(): Map<string, number> {
  const holder = globalThis as unknown as UsedTokenHolder;
  holder[USED_TOKEN_KEY] ??= new Map<string, number>();
  return holder[USED_TOKEN_KEY];
}

function tokenSecret(): string {
  for (const key of TOKEN_SECRET_ENV) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error(
    'SOVEREIGN_AUTH_SECRET or AUTH_SECRET is required for tool confirmation-token signing.',
  );
}

function sign(payload: string): string {
  return createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Deterministic hash of a tool call's input, used to bind a confirmation token to it. */
export function hashToolInput(input: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(input ?? null))
    .digest('base64url');
}

export function createToolConfirmationToken(input: {
  actorUserId: string;
  callerPluginId: string;
  providerId: string;
  tool: string;
  input: unknown;
  expiresInSeconds?: number;
}): string {
  const ttl = Math.min(
    Math.max(input.expiresInSeconds ?? DEFAULT_TOKEN_TTL_SECONDS, 60),
    MAX_TOKEN_TTL_SECONDS,
  );
  const payload: TokenPayload = {
    version: TOKEN_VERSION,
    actorUserId: input.actorUserId,
    callerPluginId: input.callerPluginId,
    providerId: input.providerId,
    tool: input.tool,
    inputHash: hashToolInput(input.input),
    nonce: randomBytes(16).toString('base64url'),
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verify a confirmation token against the exact call it's being redeemed
 * for. Throws (never returns a boolean) so every failure mode carries a
 * distinct, diagnosable message — signature, expiry, single-use, and each
 * bound field are checked and reported separately. Marks the token consumed
 * on success.
 */
export function verifyToolConfirmationToken(
  token: string,
  expected: {
    actorUserId: string;
    callerPluginId: string;
    providerId: string;
    tool: string;
    input: unknown;
  },
): void {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new Error('Invalid tool confirmation token signature.');
  }

  const now = Math.floor(Date.now() / 1000);
  const used = usedTokens();
  for (const [sig, expiresAt] of used) {
    if (expiresAt <= now) used.delete(sig);
  }
  if (used.has(signature)) {
    throw new Error('Tool confirmation token has already been used.');
  }

  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
  if (parsed.version !== TOKEN_VERSION) {
    throw new Error('Unsupported tool confirmation token version.');
  }
  if (parsed.expiresAt <= now) {
    throw new Error('Tool confirmation token has expired.');
  }
  if (parsed.actorUserId !== expected.actorUserId) {
    throw new Error('Tool confirmation token actor mismatch.');
  }
  if (parsed.callerPluginId !== expected.callerPluginId) {
    throw new Error('Tool confirmation token caller mismatch.');
  }
  if (parsed.providerId !== expected.providerId) {
    throw new Error('Tool confirmation token provider mismatch.');
  }
  if (parsed.tool !== expected.tool) {
    throw new Error('Tool confirmation token tool mismatch.');
  }
  if (parsed.inputHash !== hashToolInput(expected.input)) {
    throw new Error('Tool confirmation token input mismatch — input changed since preview.');
  }

  used.set(signature, parsed.expiresAt);
}
