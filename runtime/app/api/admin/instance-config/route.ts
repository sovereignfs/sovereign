import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID, getInstanceConfig, setInstanceConfig } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

/**
 * GET /api/admin/instance-config
 *
 * Returns the merged instance config (DB values over INSTANCE_* env defaults).
 * Admin-key authenticated. Used by the auth server (Phase 2 proxy) to render
 * branded login pages without dual-writing to its own DB.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  const pdb = await getPlatformDb();
  const config = await getInstanceConfig(pdb, DEFAULT_TENANT_ID);
  return NextResponse.json(config);
}

/**
 * PATCH /api/admin/instance-config
 *
 * Update instance config fields. Admin-key authenticated.
 * instancePrimary is validated as a 6-digit hex colour server-side.
 */
export async function PATCH(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as Partial<{
    instanceName: string | null;
    instanceLogo: string | null;
    instanceLogoDark: string | null;
    instanceFavicon: string | null;
    instancePrimary: string | null;
    emailFromName: string | null;
    emailLogo: string | null;
  }>;

  const pdb = await getPlatformDb();
  const current = await getInstanceConfig(pdb, DEFAULT_TENANT_ID);

  try {
    await setInstanceConfig(pdb, DEFAULT_TENANT_ID, {
      instanceName: 'instanceName' in body ? (body.instanceName ?? null) : current.instanceName,
      instanceLogo: 'instanceLogo' in body ? (body.instanceLogo ?? null) : current.instanceLogo,
      instanceLogoDark:
        'instanceLogoDark' in body ? (body.instanceLogoDark ?? null) : current.instanceLogoDark,
      instanceFavicon:
        'instanceFavicon' in body ? (body.instanceFavicon ?? null) : current.instanceFavicon,
      instancePrimary:
        'instancePrimary' in body ? (body.instancePrimary ?? null) : current.instancePrimary,
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
    action: 'settings.instance_config_changed',
    visibility: 'admin',
    summary: 'Instance identity config updated',
  });

  return NextResponse.json(await getInstanceConfig(pdb, DEFAULT_TENANT_ID));
}
