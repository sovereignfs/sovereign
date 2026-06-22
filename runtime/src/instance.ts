import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';

/** Absolute path to `data/instance/` — where uploaded instance assets are stored. */
export function instanceDir(): string {
  return join(findWorkspaceRoot(), 'data', 'instance');
}

/** Accepted MIME types for uploaded instance images (logo, favicon). */
export const INSTANCE_ACCEPTED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
};

/** 2 MB cap for uploaded instance assets. */
export const INSTANCE_MAX_BYTES = 2 * 1024 * 1024;

type InstanceSlot = 'logo' | 'logo-dark' | 'favicon';

/** File path for an instance asset on disk. */
export function instanceAssetPath(slot: InstanceSlot): string | null {
  const dir = instanceDir();
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find((e) => e === slot || e.startsWith(`${slot}.`));
  return match ? join(dir, match) : null;
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
};

export function instanceContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream';
}
