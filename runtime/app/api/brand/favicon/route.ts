import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import {
  DEFAULT_TENANT_ID,
  getPlatformDb,
  getTenantBranding,
  setTenantBranding,
} from '@sovereignfs/db';
import {
  BRAND_ACCEPTED_MIME,
  BRAND_MAX_BYTES,
  brandAssetPath,
  brandContentType,
  brandDir,
} from '@/src/brand';

/**
 * GET /api/brand/favicon
 *
 * Serves the branded favicon. Excluded from middleware session gate.
 * Returns 404 when no favicon is configured (Next.js falls back to the static public/favicon.ico).
 */
export async function GET(): Promise<Response> {
  const filePath = brandAssetPath('favicon');
  if (!filePath) return new NextResponse(null, { status: 404 });
  const bytes = readFileSync(filePath);
  return new Response(bytes, {
    headers: {
      'content-type': brandContentType(filePath),
      'cache-control': 'public, max-age=86400',
    },
  });
}

/**
 * POST /api/brand/favicon
 *
 * Upload a new favicon. Admin-gated. Stores at data/brand/favicon.<ext>.
 */
export async function POST(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role');
  if (!role || role === 'platform:user' || role === 'platform:auditor') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no file provided' }, { status: 400 });
  }
  if (file.size > BRAND_MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 2 MB)' }, { status: 400 });
  }
  const ext = BRAND_ACCEPTED_MIME[file.type];
  if (!ext) {
    return NextResponse.json({ error: `unsupported type ${file.type}` }, { status: 400 });
  }

  const dir = brandDir();
  mkdirSync(dir, { recursive: true });
  const prior = brandAssetPath('favicon');
  if (prior) {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(prior);
  }
  const dest = join(dir, `favicon.${ext}`);
  writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

  const url = '/api/brand/favicon';
  const pdb = await getPlatformDb();
  const current = await getTenantBranding(pdb, DEFAULT_TENANT_ID);
  await setTenantBranding(pdb, DEFAULT_TENANT_ID, { ...current, brandFavicon: url });

  return NextResponse.json({ url });
}

/**
 * DELETE /api/brand/favicon
 *
 * Remove the uploaded favicon. Sets DB field to null so the static favicon.ico is used.
 */
export async function DELETE(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role');
  if (!role || role === 'platform:user' || role === 'platform:auditor') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const prior = brandAssetPath('favicon');
  if (prior) {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(prior);
  }

  const pdb = await getPlatformDb();
  const current = await getTenantBranding(pdb, DEFAULT_TENANT_ID);
  await setTenantBranding(pdb, DEFAULT_TENANT_ID, { ...current, brandFavicon: null });

  return NextResponse.json({ ok: true });
}
