import { NextResponse } from 'next/server';
import { setPluginEnabled } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';
import { getInstalledPlugins } from '@/src/registry';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const installed = getInstalledPlugins();
  if (!installed.some((p) => p.id === id)) {
    return NextResponse.json({ error: 'plugin not found' }, { status: 404 });
  }

  const body = (await request.json()) as { enabled?: boolean };
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
  }
  // The shell itself is never toggleable: a disabled plugin's prefix 404s in
  // the proxy (SRS CON-07), so disabling Console/Launcher/Account/Inbox would
  // lock every user out with no way back except the DB.
  if (CHROME_PLUGIN_IDS.has(id)) {
    return NextResponse.json(
      { error: 'platform chrome plugins are always enabled and cannot be toggled' },
      { status: 403 },
    );
  }

  await setPluginEnabled(await getPlatformDb(), id, body.enabled);

  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: body.enabled ? 'plugin.enabled' : 'plugin.disabled',
    targetType: 'plugin',
    targetId: id,
    visibility: 'admin',
    summary: `Plugin ${id} ${body.enabled ? 'enabled' : 'disabled'}`,
    metadata: { pluginId: id, enabled: body.enabled },
  });

  return NextResponse.json({ id, enabled: body.enabled });
}
