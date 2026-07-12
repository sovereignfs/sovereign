import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';
import type { PluginStorageObjectRow } from '@sovereignfs/db';
import type { StorageObject } from '@sovereignfs/sdk';

const TOKEN_VERSION = 'sv1';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 5 * 60;
const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNING_SECRET_ENV = ['SOVEREIGN_AUTH_SECRET', 'AUTH_SECRET'] as const;

const DEFAULT_MAX_OBJECT_BYTES = 25 * 1024 * 1024; // 25 MiB
const DEFAULT_MAX_PLUGIN_BYTES = 500 * 1024 * 1024; // 500 MiB

export class StorageQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}

/** Absolute path to a plugin's storage directory (workspace-root `data/plugins/<id>/storage`). */
export function pluginStorageDir(pluginId: string): string {
  return join(findWorkspaceRoot(), 'data', 'plugins', pluginId, 'storage');
}

/**
 * Physical path for one object. `objectId` is always a server-generated opaque
 * ID (never the plugin-facing `key`), so there is no path-traversal surface —
 * this function never interpolates caller-supplied strings into a path.
 */
function objectFilePath(pluginId: string, objectId: string): string {
  return join(pluginStorageDir(pluginId), objectId);
}

export async function toBuffer(body: Blob | ArrayBuffer | Uint8Array): Promise<Buffer> {
  if (body instanceof Buffer) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(await body.arrayBuffer());
}

export function checksumOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function maxObjectBytes(): number {
  const raw = process.env.SOVEREIGN_STORAGE_MAX_OBJECT_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_OBJECT_BYTES;
}

export function maxPluginBytes(): number {
  const raw = process.env.SOVEREIGN_STORAGE_MAX_PLUGIN_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PLUGIN_BYTES;
}

export function writeObjectBytes(pluginId: string, objectId: string, bytes: Buffer): void {
  const dir = pluginStorageDir(pluginId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(objectFilePath(pluginId, objectId), bytes);
}

export function readObjectBytes(pluginId: string, objectId: string): Buffer | null {
  const path = objectFilePath(pluginId, objectId);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

export function deleteObjectBytes(pluginId: string, objectId: string): void {
  rmSync(objectFilePath(pluginId, objectId), { force: true });
}

export function storageMetadataToJson(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (metadata == null) return null;
  const json = JSON.stringify(metadata);
  if (json.length > 8192) throw new Error('Storage object metadata must be 8 KiB or smaller.');
  return json;
}

export function toStorageObject(row: PluginStorageObjectRow): StorageObject {
  return {
    id: row.id,
    pluginId: row.pluginId,
    ownerUserId: row.ownerUserId,
    key: row.key,
    contentType: row.contentType,
    size: row.size,
    checksum: row.checksum,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function signingSecret(): string {
  for (const key of SIGNING_SECRET_ENV) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error('SOVEREIGN_AUTH_SECRET or AUTH_SECRET is required for storage signed URLs.');
}

function b64(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

interface SignedTokenPayload {
  version: typeof TOKEN_VERSION;
  tenantId: string;
  pluginId: string;
  objectId: string;
  expiresAt: number;
}

/**
 * Create a short-lived, read-only, single-object download token
 * (`sdk.storage.getSignedUrl`, RFC 0044). Scoped to one object and a bounded
 * expiry; the client cannot extend expiry or widen access by editing it —
 * any tampering fails the signature check in `verifyStorageToken`.
 */
export function createStorageToken(input: {
  tenantId: string;
  pluginId: string;
  objectId: string;
  expiresInSeconds?: number;
}): string {
  const ttl = Math.min(
    Math.max(input.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS, 1),
    MAX_SIGNED_URL_TTL_SECONDS,
  );
  const payload: SignedTokenPayload = {
    version: TOKEN_VERSION,
    tenantId: input.tenantId,
    pluginId: input.pluginId,
    objectId: input.objectId,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  const encoded = b64(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/** Verify and decode a storage download token. Throws on any invalid, tampered, or expired token. */
export function verifyStorageToken(token: string): SignedTokenPayload {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new Error('Invalid storage token signature.');
  }
  const parsed = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as SignedTokenPayload;
  if (parsed.version !== TOKEN_VERSION) throw new Error('Unsupported storage token version.');
  if (parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('Storage token has expired.');
  }
  return parsed;
}
