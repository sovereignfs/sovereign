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
 * GET /api/brand/logo[?dark=1]
 *
 * Serves the light-theme logo (or dark-theme when ?dark=1 is set).
 * Excluded from the middleware session gate — must load on the login page.
 * Returns 404 when no logo is configured.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const isDark = searchParams.get('dark') === '1';
  const slot = isDark ? 'logo-dark' : 'logo';

  const filePath = brandAssetPath(slot);
  if (!filePath) {
    // Fall back from dark logo to light logo.
    if (isDark) {
      const lightPath = brandAssetPath('logo');
      if (lightPath) {
        const bytes = readFileSync(lightPath);
        return new Response(bytes, {
          headers: {
            'content-type': brandContentType(lightPath),
            'cache-control': 'public, max-age=86400',
          },
        });
      }
    }
    return new NextResponse(null, { status: 404 });
  }
  const bytes = readFileSync(filePath);
  return new Response(bytes, {
    headers: {
      'content-type': brandContentType(filePath),
      'cache-control': 'public, max-age=86400',
    },
  });
}

/**
 * POST /api/brand/logo[?dark=1]
 *
 * Upload a new logo. Admin-gated (middleware injects x-sovereign-user-role).
 * Accepts multipart/form-data with a `file` field.
 * Stores on disk at data/brand/logo.<ext> (or logo-dark.<ext>).
 * Updates tenant_branding to point at the servable URL.
 */
export async function POST(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role');
  if (!role || role === 'platform:user' || role === 'platform:auditor') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const isDark = searchParams.get('dark') === '1';
  const slot: 'logo' | 'logo-dark' = isDark ? 'logo-dark' : 'logo';

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
  // Remove any prior file for this slot regardless of extension.
  const prior = brandAssetPath(slot);
  if (prior) {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(prior);
  }
  const dest = join(dir, `${slot}.${ext}`);
  writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

  // Path-relative URL so it stays valid across hostname changes.
  const url = isDark ? '/api/brand/logo?dark=1' : '/api/brand/logo';

  const pdb = await getPlatformDb();
  const current = await getTenantBranding(pdb, DEFAULT_TENANT_ID);
  await setTenantBranding(pdb, DEFAULT_TENANT_ID, {
    ...current,
    ...(isDark ? { brandLogoDark: url } : { brandLogo: url }),
  });

  return NextResponse.json({ url });
}

/**
 * DELETE /api/brand/logo[?dark=1]
 *
 * Remove the uploaded logo. Sets the DB field to null so the env-var default applies.
 */
export async function DELETE(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role');
  if (!role || role === 'platform:user' || role === 'platform:auditor') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const isDark = searchParams.get('dark') === '1';
  const slot: 'logo' | 'logo-dark' = isDark ? 'logo-dark' : 'logo';

  const prior = brandAssetPath(slot);
  if (prior) {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(prior);
  }

  const pdb = await getPlatformDb();
  const current = await getTenantBranding(pdb, DEFAULT_TENANT_ID);
  await setTenantBranding(pdb, DEFAULT_TENANT_ID, {
    ...current,
    ...(isDark ? { brandLogoDark: null } : { brandLogo: null }),
  });

  return NextResponse.json({ ok: true });
}
