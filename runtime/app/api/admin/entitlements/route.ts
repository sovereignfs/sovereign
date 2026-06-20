import { NextResponse } from 'next/server';
import { getPaidPluginsWithoutEntitlement, listAllEntitlements } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';

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
