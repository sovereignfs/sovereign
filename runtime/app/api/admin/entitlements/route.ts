import { NextResponse } from 'next/server';
import {
  cancelEntitlement,
  getActiveEntitlement,
  getPaidPluginsWithoutEntitlement,
  listAllEntitlements,
  saveEntitlement,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { verifyLicenseToken } from '@/src/license';
import { logActivity } from '@/src/activity';

/**
 * GET /api/admin/entitlements
 *
 * Two modes:
 * - `?userId=<id>` — returns `{ paywalled: string[] }`, the subset of paid
 *   plugin IDs for which this user has no active entitlement. Consumed by
 *   the Edge middleware to gate paid plugin routes (same pattern as
 *   /api/admin/plugins/disabled).
 * - no userId — returns `{ entitlements: EntitlementRow[] }` (admin overview).
 *
 * Admin-key authenticated; excluded from the middleware matcher.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');

  const pdb = await getPlatformDb();

  if (userId) {
    // Collect IDs of installed plugins with a non-free monetization model.
    const paidPluginIds = getInstalledPlugins()
      .filter((p) => p.monetization && p.monetization.model !== 'free')
      .map((p) => p.id);

    const paywalled = await getPaidPluginsWithoutEntitlement(pdb, userId, paidPluginIds);
    return NextResponse.json({ paywalled });
  }

  const entitlements = await listAllEntitlements(pdb);
  return NextResponse.json({ entitlements });
}

/**
 * POST /api/admin/entitlements — grant a signed license to a specific user.
 *
 * Body: `{ licenseToken, targetUserId, pluginId }`.
 * Verifies the token against the plugin's public key, then saves the entitlement
 * for `targetUserId` (replacing any existing active entitlement for the same plugin).
 *
 * Admin-key authenticated. Used by the Console license generator's "Grant to user" action.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    licenseToken?: string;
    targetUserId?: string;
    pluginId?: string;
  } | null;

  if (!body?.licenseToken || !body.targetUserId || !body.pluginId) {
    return NextResponse.json(
      { error: 'licenseToken, targetUserId, and pluginId are required.' },
      { status: 400 },
    );
  }

  const { licenseToken, targetUserId, pluginId } = body;

  const plugin = getInstalledPlugins().find((p) => p.id === pluginId);
  if (!plugin) {
    return NextResponse.json({ error: 'Plugin not found.' }, { status: 404 });
  }

  const publicKey = plugin.monetization?.license?.publicKey;
  if (!publicKey) {
    return NextResponse.json(
      { error: 'Plugin manifest does not declare a license public key.' },
      { status: 400 },
    );
  }

  const result = verifyLicenseToken(licenseToken.trim(), publicKey, pluginId);
  if (!result.valid || !result.payload) {
    return NextResponse.json({ error: result.error ?? 'Invalid license token.' }, { status: 422 });
  }

  const { payload } = result;
  const pdb = await getPlatformDb();

  const existing = await getActiveEntitlement(pdb, targetUserId, pluginId);
  if (existing) {
    await cancelEntitlement(pdb, existing.id);
  }

  const id = crypto.randomUUID();
  await saveEntitlement(pdb, {
    id,
    userId: targetUserId,
    pluginId,
    tierId: payload.tier ?? null,
    status: 'active',
    source: 'admin_grant',
    licenseToken: licenseToken.trim(),
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt ?? null,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  });

  void logActivity({
    actorType: 'user',
    action: 'admin.license_granted',
    targetType: 'plugin',
    targetId: pluginId,
    summary: `Admin granted license for ${plugin.name} to user ${targetUserId.slice(0, 8)}…${payload.tier ? ` (${payload.tier} tier)` : ''}`,
    visibility: 'admin',
  });

  return NextResponse.json({ ok: true, entitlementId: id });
}
