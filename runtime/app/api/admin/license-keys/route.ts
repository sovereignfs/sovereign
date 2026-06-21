import { NextResponse } from 'next/server';
import { deletePlatformSetting, getPlatformSetting, setPlatformSetting } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';

const KEY_PREFIX = 'license_private_key:';

/**
 * GET /api/admin/license-keys
 *
 * Returns `{ keys: Record<pluginId, string> }` — the stored private key `d`
 * values for each installed monetized plugin that has one saved. The value is
 * the raw base64url `d` scalar as stored by POST below.
 *
 * Admin-key authenticated.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const pdb = await getPlatformDb();
  const monetizedIds = getInstalledPlugins()
    .filter((p) => p.monetization?.license?.publicKey)
    .map((p) => p.id);

  const entries = await Promise.all(
    monetizedIds.map(async (id) => {
      const val = await getPlatformSetting(pdb, `${KEY_PREFIX}${id}`);
      return [id, val] as const;
    }),
  );

  const keys = Object.fromEntries(entries.filter(([, v]) => v !== null)) as Record<string, string>;
  return NextResponse.json({ keys });
}

/**
 * POST /api/admin/license-keys
 *
 * Body: `{ pluginId: string; privateKey: string }`.
 * Stores the private key `d` value in `platform_settings` under
 * `license_private_key:<pluginId>` so the Console generator can pre-fill it
 * on any device without the operator pasting it again.
 *
 * Admin-key authenticated.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    pluginId?: string;
    privateKey?: string;
  } | null;

  if (!body?.pluginId || !body.privateKey) {
    return NextResponse.json({ error: 'pluginId and privateKey are required.' }, { status: 400 });
  }

  const plugin = getInstalledPlugins().find((p) => p.id === body.pluginId);
  if (!plugin?.monetization?.license?.publicKey) {
    return NextResponse.json(
      { error: 'Plugin not found or has no license public key.' },
      { status: 404 },
    );
  }

  const pdb = await getPlatformDb();
  await setPlatformSetting(pdb, `${KEY_PREFIX}${body.pluginId}`, body.privateKey.trim());

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/license-keys?pluginId=<id>
 *
 * Removes a stored private key from `platform_settings`. No-op if the key was
 * never saved. Admin-key authenticated.
 */
export async function DELETE(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const pluginId = url.searchParams.get('pluginId');
  if (!pluginId) {
    return NextResponse.json({ error: 'pluginId query param is required.' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  await deletePlatformSetting(pdb, `${KEY_PREFIX}${pluginId}`);

  return NextResponse.json({ ok: true });
}
