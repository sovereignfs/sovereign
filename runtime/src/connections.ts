import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PluginConnectionRefRow } from '@sovereignfs/db';
import type {
  ConnectionOAuthState,
  ConnectionRef,
  ConnectionScope,
  SanitizedConnectionError,
} from '@sovereignfs/sdk';

const STATE_VERSION = 'sv1';
const DEFAULT_STATE_TTL_SECONDS = 10 * 60;
const MAX_STATE_TTL_SECONDS = 30 * 60;
const STATE_SECRET_ENV = ['SOVEREIGN_AUTH_SECRET', 'AUTH_SECRET'] as const;
const USED_STATE_KEY = Symbol.for('@sovereignfs/runtime:used-oauth-states');

interface StatePayload extends ConnectionOAuthState {
  version: typeof STATE_VERSION;
}

interface UsedStateHolder {
  [USED_STATE_KEY]?: Map<string, number>;
}

function usedStates(): Map<string, number> {
  const holder = globalThis as unknown as UsedStateHolder;
  holder[USED_STATE_KEY] ??= new Map<string, number>();
  return holder[USED_STATE_KEY];
}

function stateSecret(): string {
  for (const key of STATE_SECRET_ENV) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error('SOVEREIGN_AUTH_SECRET or AUTH_SECRET is required for OAuth state signing.');
}

function b64(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', stateSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function metadataToJson(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (metadata == null) return null;
  const json = JSON.stringify(metadata);
  if (json.length > 8192) throw new Error('Connection metadata must be 8 KiB or smaller.');
  return json;
}

export function errorToJson(error: SanitizedConnectionError): string {
  const safe = {
    code: error.code?.slice(0, 120),
    message: error.message.slice(0, 500),
    retryable: error.retryable,
    status: error.status,
  };
  const json = JSON.stringify(safe);
  if (json.length > 1024) throw new Error('Connection error metadata must be 1 KiB or smaller.');
  return json;
}

function parseRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseError(raw: string | null): SanitizedConnectionError | null {
  const parsed = parseRecord(raw);
  if (!parsed || typeof parsed.message !== 'string') return null;
  return {
    code: typeof parsed.code === 'string' ? parsed.code : undefined,
    message: parsed.message,
    retryable: typeof parsed.retryable === 'boolean' ? parsed.retryable : undefined,
    status: typeof parsed.status === 'number' ? parsed.status : undefined,
  };
}

export function normalizeConnectionLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) throw new Error('Connection label is required.');
  return trimmed.slice(0, 120);
}

export function normalizeProvider(provider: string): string {
  const trimmed = provider.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,119}$/.test(trimmed)) {
    throw new Error('Connection provider must be a lowercase provider id.');
  }
  return trimmed;
}

export function toConnectionRef(row: PluginConnectionRefRow): ConnectionRef {
  return {
    id: row.id,
    scope: row.scope,
    provider: row.provider,
    label: row.label,
    status: row.status,
    secretRef: row.secretRef,
    metadata: parseRecord(row.metadata),
    lastCheckedAt: row.lastCheckedAt,
    lastUsedAt: row.lastUsedAt,
    lastError: parseError(row.lastError),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    disconnectedAt: row.disconnectedAt,
  };
}

export function requireInstanceConnectionCapability(
  scope: ConnectionScope,
  capabilities: readonly string[],
): void {
  if (scope === 'instance' && !capabilities.includes('instance:configure')) {
    throw new Error('sdk.connections instance scope requires the instance:configure capability.');
  }
}

export function createOAuthStateToken(input: {
  pluginId: string;
  userId: string;
  provider: string;
  callbackPath: string;
  nonce?: string;
  metadata?: Record<string, unknown> | null;
  expiresInSeconds?: number;
}): string {
  if (!input.callbackPath.startsWith('/')) {
    throw new Error('OAuth callbackPath must start with "/".');
  }
  const ttl = Math.min(
    Math.max(input.expiresInSeconds ?? DEFAULT_STATE_TTL_SECONDS, 60),
    MAX_STATE_TTL_SECONDS,
  );
  const payload: StatePayload = {
    version: STATE_VERSION,
    pluginId: input.pluginId,
    userId: input.userId,
    provider: normalizeProvider(input.provider),
    callbackPath: input.callbackPath,
    nonce: input.nonce ?? randomBytes(16).toString('base64url'),
    metadata: input.metadata ?? null,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  const encoded = b64(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyOAuthStateToken(
  state: string,
  expected: { pluginId: string; userId: string | null; callbackPath?: string },
): ConnectionOAuthState {
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new Error('Invalid OAuth state signature.');
  }
  const now = Math.floor(Date.now() / 1000);
  const used = usedStates();
  for (const [sig, expiresAt] of used) {
    if (expiresAt <= now) used.delete(sig);
  }
  if (used.has(signature)) throw new Error('OAuth state has already been used.');

  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StatePayload;
  if (parsed.version !== STATE_VERSION) throw new Error('Unsupported OAuth state version.');
  if (parsed.expiresAt <= now) throw new Error('OAuth state has expired.');
  if (parsed.pluginId !== expected.pluginId) throw new Error('OAuth state plugin mismatch.');
  if (!expected.userId || parsed.userId !== expected.userId) {
    throw new Error('OAuth state actor mismatch.');
  }
  if (expected.callbackPath && parsed.callbackPath !== expected.callbackPath) {
    throw new Error('OAuth state callback mismatch.');
  }
  used.set(signature, parsed.expiresAt);
  return {
    pluginId: parsed.pluginId,
    provider: parsed.provider,
    userId: parsed.userId,
    callbackPath: parsed.callbackPath,
    nonce: parsed.nonce,
    metadata: parsed.metadata,
    expiresAt: parsed.expiresAt,
  };
}
