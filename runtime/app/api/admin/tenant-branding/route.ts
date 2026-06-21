import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID, getTenantBranding, setTenantBranding } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

/**
 * GET /api/admin/tenant-branding
 *
 * Returns the merged tenant branding config (DB values over BRAND_* env defaults).
 * Admin-key authenticated. Used by the auth server (Phase 2 proxy) to render
 * branded login pages without dual-writing to its own DB.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  const pdb = await getPlatformDb();
  const branding = await getTenantBranding(pdb, DEFAULT_TENANT_ID);
  return NextResponse.json(branding);
}

/**
 * PATCH /api/admin/tenant-branding
 *
 * Update tenant branding fields. Admin-key authenticated.
 * brand_primary is validated as a 6-digit hex colour server-side.
 */
export async function PATCH(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as Partial<{
    brandName: string | null;
    brandLogo: string | null;
    brandLogoDark: string | null;
    brandFavicon: string | null;
    brandPrimary: string | null;
    emailFromName: string | null;
    emailLogo: string | null;
  }>;

  const pdb = await getPlatformDb();
  const current = await getTenantBranding(pdb, DEFAULT_TENANT_ID);

  try {
    await setTenantBranding(pdb, DEFAULT_TENANT_ID, {
      brandName: 'brandName' in body ? (body.brandName ?? null) : current.brandName,
      brandLogo: 'brandLogo' in body ? (body.brandLogo ?? null) : current.brandLogo,
      brandLogoDark: 'brandLogoDark' in body ? (body.brandLogoDark ?? null) : current.brandLogoDark,
      brandFavicon: 'brandFavicon' in body ? (body.brandFavicon ?? null) : current.brandFavicon,
      brandPrimary: 'brandPrimary' in body ? (body.brandPrimary ?? null) : current.brandPrimary,
      emailFromName: 'emailFromName' in body ? (body.emailFromName ?? null) : current.emailFromName,
      emailLogo: 'emailLogo' in body ? (body.emailLogo ?? null) : current.emailLogo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const actorId = request.headers.get('x-sovereign-user-id');
  void logActivity({
    actorId,
    actorType: 'user',
    action: 'settings.branding_changed',
    visibility: 'admin',
    summary: 'Tenant branding updated',
  });

  return NextResponse.json(await getTenantBranding(pdb, DEFAULT_TENANT_ID));
}
