import { NextResponse } from 'next/server';
import { deletePlatformSetting, getPlatformSetting, setPlatformSetting } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';

const PRIV_PREFIX = 'license_private_key:';
const PUB_PREFIX = 'license_public_key:';

/**
 * GET /api/admin/license-keys
 *
 * Returns stored keypair values for each installed monetized plugin.
 * `keys` = private key `d` values; `publicKeys` = public key `x` values
 * (only present when saved via POST, i.e. when the operator used the Console
 * keypair generator and clicked "Save to instance").
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
      const [priv, pub] = await Promise.all([
        getPlatformSetting(pdb, `${PRIV_PREFIX}${id}`),
        getPlatformSetting(pdb, `${PUB_PREFIX}${id}`),
      ]);
      return [id, { priv, pub }] as const;
    }),
  );

  const keys: Record<string, string> = {};
  const publicKeys: Record<string, string> = {};
  for (const [id, { priv, pub }] of entries) {
    if (priv) keys[id] = priv;
    if (pub) publicKeys[id] = pub;
  }
  return NextResponse.json({ keys, publicKeys });
}

/**
 * POST /api/admin/license-keys
 *
 * Body: `{ pluginId: string; privateKey: string; publicKey?: string }`.
 * Stores both keys in `platform_settings`. `publicKey` (the JWK `x` value) is
 * optional but strongly recommended when using a keypair generated in the
 * Console — once stored it becomes the authoritative verification key,
 * overriding the manifest value, so token verification works without a redeploy.
 *
 * Admin-key authenticated.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    pluginId?: string;
    privateKey?: string;
    publicKey?: string;
  } | null;

  if (!body?.pluginId || !body.privateKey) {
    return NextResponse.json({ error: 'pluginId and privateKey are required.' }, { status: 400 });
  }

  const plugin = getInstalledPlugins().find((p) => p.id === body.pluginId);
  if (!plugin?.monetization) {
    return NextResponse.json(
      { error: 'Plugin not found or has no monetization config.' },
      { status: 404 },
    );
  }

  const pdb = await getPlatformDb();
  const writes: Promise<void>[] = [
    setPlatformSetting(pdb, `${PRIV_PREFIX}${body.pluginId}`, body.privateKey.trim()),
  ];
  if (body.publicKey?.trim()) {
    writes.push(setPlatformSetting(pdb, `${PUB_PREFIX}${body.pluginId}`, body.publicKey.trim()));
  }
  await Promise.all(writes);

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/license-keys?pluginId=<id>
 *
 * Removes both the stored private and public keys from `platform_settings`.
 * Admin-key authenticated.
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
  await Promise.all([
    deletePlatformSetting(pdb, `${PRIV_PREFIX}${pluginId}`),
    deletePlatformSetting(pdb, `${PUB_PREFIX}${pluginId}`),
  ]);

  return NextResponse.json({ ok: true });
}
