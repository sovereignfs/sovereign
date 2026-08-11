import { NextResponse } from 'next/server';
import { buildPluginManifest, findInstallablePlugin } from '@/src/plugin-manifest';
import { getPlatformDb } from '@/src/db';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';

/**
 * Per-plugin web app manifest (RFC 0081), extending the instance-level
 * `/api/manifest` route this file sits alongside rather than duplicating it —
 * same instance-config lookup, same degrade-on-DB-failure behavior, same
 * response headers. Lets a plugin declaring `installable: true` be installed
 * from a browser as its own home-screen app, scoped to its `routePrefix`,
 * instead of the whole instance.
 *
 * **Session-exempt, safely.** This path is nested under the already-reserved
 * `manifest` API segment (`RESERVED_API_SEGMENTS`,
 * `runtime/src/api-namespace.ts`) and excluded from the middleware matcher
 * for the same reason the instance-level route is: browsers fetch a
 * manifest before the user is signed in, so it cannot be session-gated. The
 * exemption is safe here for the same reason it's safe there — this route
 * only re-exposes fields the plugin's own manifest already publishes (name,
 * description, icon, routePrefix), all of which any authenticated user
 * already sees on that plugin's sidebar icon or Launcher tile. No per-user
 * data, no DB write, nothing an anonymous caller couldn't already infer from
 * `GET /api/manifest` plus the plugin's public presence in the UI.
 *
 * Unknown plugin id, disabled plugin, or a plugin that doesn't declare
 * `installable: true` all collapse to 404 — see
 * `runtime/src/plugin-manifest.ts`'s `findInstallablePlugin` doc comment.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pluginId: string }> },
): Promise<Response> {
  const { pluginId } = await params;

  const disabledIds = new Set<string>();
  try {
    const pdb = await getPlatformDb();
    for (const id of await getDisabledPluginIds(pdb)) disabledIds.add(id);
  } catch {
    // Disabled-plugin status is advisory for this route's 404 decision — a
    // DB failure degrades to "nothing is disabled" rather than failing the
    // request, mirroring the instance-level manifest route's own
    // degrade-on-DB-failure behavior.
  }

  const plugin = findInstallablePlugin(pluginId, getInstalledPlugins(), disabledIds);
  if (!plugin) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Same hardcoded values the instance-level manifest route uses today —
  // there is no per-instance theme-color config plumbed into either route
  // yet, so this simply keeps a white-labeled instance's per-plugin apps
  // consistent with its own instance-level app rather than introducing a
  // new, unimplemented theming input.
  const manifest = buildPluginManifest(plugin, '#09090b', '#09090b');

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
