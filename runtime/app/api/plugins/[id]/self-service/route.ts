import { NextResponse } from 'next/server';
import {
  getPluginAccessPolicy,
  grantPluginAccessUser,
  revokePluginAccessUser,
} from '@sovereignfs/db';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
import { hasUserCapability } from '@/src/user-capabilities';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Self-service plugin access (RFC 0065 "Self-service opt-in"). Session-gated
 * by the middleware (`x-sovereign-user-id`/`-role` headers) — no admin key.
 * This is the mechanism layer only; Task 15.3 builds the Launcher-facing
 * directory UI on top of it.
 *
 * A user may grant/revoke their own `plugin_access_users` row for a plugin
 * only when: they hold the RFC 0070 `plugins:self-manage` capability, and the
 * plugin's policy is `selected_users` with `self_service = true`. Self-service
 * for `selected_groups` requires a "self-joinable group" concept this task
 * does not add — such a plugin's self-service flag has no effect until that
 * lands; grant attempts against it are rejected.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  const role = request.headers.get('x-sovereign-user-role') ?? 'platform:user';
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id: pluginId } = await params;
  const pdb = await getPlatformDb();

  const eligible = await hasUserCapability({ id: userId, role }, 'plugins:self-manage');
  if (!eligible) {
    return NextResponse.json({ error: 'plugins:self-manage capability required' }, { status: 403 });
  }

  const policy = await getPluginAccessPolicy(pdb, pluginId);
  if (!policy || policy.accessPolicy !== 'selected_users' || !policy.selfService) {
    return NextResponse.json(
      { error: 'This plugin is not open to self-service access' },
      { status: 403 },
    );
  }

  await grantPluginAccessUser(pdb, pluginId, userId, userId);

  void logActivity({
    actorId: userId,
    actorType: 'user',
    action: 'plugin.self_service_granted',
    targetType: 'plugin',
    targetId: pluginId,
    visibility: 'admin',
    summary: `Self-granted access to plugin "${pluginId}"`,
    metadata: { pluginId },
  });

  return NextResponse.json({ pluginId, granted: true });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  const role = request.headers.get('x-sovereign-user-role') ?? 'platform:user';
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const eligible = await hasUserCapability({ id: userId, role }, 'plugins:self-manage');
  if (!eligible) {
    return NextResponse.json({ error: 'plugins:self-manage capability required' }, { status: 403 });
  }

  const { id: pluginId } = await params;
  const pdb = await getPlatformDb();
  await revokePluginAccessUser(pdb, pluginId, userId);

  void logActivity({
    actorId: userId,
    actorType: 'user',
    action: 'plugin.self_service_revoked',
    targetType: 'plugin',
    targetId: pluginId,
    visibility: 'admin',
    summary: `Self-revoked access to plugin "${pluginId}"`,
    metadata: { pluginId },
  });

  return NextResponse.json({ pluginId, granted: false });
}
