import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';

/** Absolute path to `data/brand/` — where uploaded brand assets are stored. */
export function brandDir(): string {
  return join(findWorkspaceRoot(), 'data', 'brand');
}

/** Accepted MIME types for uploaded brand images (logo, favicon). */
export const BRAND_ACCEPTED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
};

/** 2 MB cap for uploaded brand assets. */
export const BRAND_MAX_BYTES = 2 * 1024 * 1024;

type BrandSlot = 'logo' | 'logo-dark' | 'favicon';

/** File path for a brand asset on disk. */
export function brandAssetPath(slot: BrandSlot): string | null {
  const dir = brandDir();
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

export function brandContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream';
}
