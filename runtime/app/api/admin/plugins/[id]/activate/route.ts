import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
import { activatePlugin } from '@/src/plugin-catalog';
import { getInstalledPlugins } from '@/src/registry';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/plugins/[id]/activate
 *
 * Activates a cataloged-but-inactive plugin (RFC 0065 Task 3.28): creates its
 * `plugin_status` row with `access_policy = 'disabled'` — an operator sets a
 * real policy from Console next (Task 13.7). No filesystem write, no restart;
 * the plugin's migrations already run unconditionally at every boot, so they
 * don't need to run here. No-op (200, `activated: false`) if already active.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  if (!getInstalledPlugins().some((p) => p.id === id)) {
    return NextResponse.json({ error: 'plugin not found' }, { status: 404 });
  }

  const result = await activatePlugin(await getPlatformDb(), id);

  if (result.activated) {
    void logActivity({
      actorId: request.headers.get('x-sovereign-user-id'),
      actorType: 'user',
      action: 'plugin.activated',
      targetType: 'plugin',
      targetId: id,
      visibility: 'admin',
      summary: `Plugin ${id} activated`,
      metadata: { pluginId: id },
    });
  }

  return NextResponse.json({ id, ...result });
}
