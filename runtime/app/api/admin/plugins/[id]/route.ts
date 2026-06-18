import { NextResponse } from 'next/server';
import { setPluginEnabled } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
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
