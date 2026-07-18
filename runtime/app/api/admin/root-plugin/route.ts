import { NextResponse } from 'next/server';
import { DEFAULT_ROOT_PLUGIN_ID, getPlatformSetting } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getRestrictedPluginIds } from '@/src/plugin-access-server';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';
import { resolveRootRoutePrefix } from '@/src/root-plugin';

/**
 * The `routePrefix` the platform root `/` should serve in place (PLT-14), or
 * null when neither the configured root plugin nor the Launcher fallback
 * resolves for the current user. The middleware (Edge — no DB access) fetches
 * this to rewrite `/`, the same round-trip pattern as
 * `/api/admin/plugins/disabled`.
 *
 * `?userId=&role=` are optional — omitted, the endpoint resolves without
 * per-user access-policy restriction (legacy/unauthenticated callers).
 * Supplied, RFC 0065 access policy is checked and, when the configured root
 * plugin is inaccessible to this user (disabled or policy-denied), the
 * Launcher is tried as a fallback before giving up — the caller renders its
 * own "No apps available" state when even that fails (`(platform)/page.tsx`).
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const role = url.searchParams.get('role') ?? 'platform:user';

  const db = await getPlatformDb();
  const rootPluginId = (await getPlatformSetting(db, 'root_plugin_id')) ?? DEFAULT_ROOT_PLUGIN_ID;
  const installedPlugins = getInstalledPlugins();
  const disabledIds = new Set(await getDisabledPluginIds(db));
  const restrictedIds = userId
    ? new Set(
        await getRestrictedPluginIds(
          db,
          userId,
          role,
          installedPlugins.map((p) => p.id),
        ),
      )
    : undefined;

  const routePrefix = resolveRootRoutePrefix(
    rootPluginId,
    installedPlugins,
    disabledIds,
    restrictedIds,
  );
  if (routePrefix !== null) {
    return NextResponse.json({ routePrefix });
  }
  if (rootPluginId === DEFAULT_ROOT_PLUGIN_ID) {
    // Already tried the Launcher itself — no further fallback available.
    return NextResponse.json({ routePrefix: null });
  }
  const launcherPrefix = resolveRootRoutePrefix(
    DEFAULT_ROOT_PLUGIN_ID,
    installedPlugins,
    disabledIds,
    restrictedIds,
  );
  return NextResponse.json({ routePrefix: launcherPrefix });
}
