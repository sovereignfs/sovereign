import { NextResponse } from 'next/server';
import {
  getPluginAccessPolicy,
  listPluginAccessGroups,
  listPluginAccessUsers,
  setPluginAccessPolicy,
  type PluginAccessPolicyValue,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_POLICIES: readonly PluginAccessPolicyValue[] = [
  'everyone',
  'admins',
  'selected_users',
  'selected_groups',
  'disabled',
];

/**
 * GET /api/admin/plugins/[id]/access
 *
 * A plugin's current access policy plus its resolved user/group grants (RFC
 * 0065 Task 13.7). Defaults `everyone`/`false` when the plugin has no
 * explicit `plugin_status` row yet (pre-activation legacy state — Task 3.28's
 * activation flow sets `disabled` explicitly, so this default only applies to
 * a plugin that predates the access-policy work and was never re-saved).
 */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const pdb = await getPlatformDb();
  const [policy, users, groups] = await Promise.all([
    getPluginAccessPolicy(pdb, id),
    listPluginAccessUsers(pdb, id),
    listPluginAccessGroups(pdb, id),
  ]);

  return NextResponse.json({
    pluginId: id,
    accessPolicy: policy?.accessPolicy ?? 'everyone',
    selfService: policy?.selfService ?? false,
    users,
    groups,
  });
}

/** PATCH /api/admin/plugins/[id]/access — set the policy and self-service flag. */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  if (!getInstalledPlugins().some((p) => p.id === id)) {
    return NextResponse.json({ error: 'plugin not found' }, { status: 404 });
  }

  const body = (await request.json()) as { accessPolicy?: unknown; selfService?: unknown };
  if (
    typeof body.accessPolicy !== 'string' ||
    !VALID_POLICIES.includes(body.accessPolicy as PluginAccessPolicyValue)
  ) {
    return NextResponse.json(
      { error: `accessPolicy must be one of: ${VALID_POLICIES.join(', ')}` },
      { status: 400 },
    );
  }
  const selfService = body.selfService === true;

  await setPluginAccessPolicy(
    await getPlatformDb(),
    id,
    body.accessPolicy as PluginAccessPolicyValue,
    selfService,
  );

  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'plugin.access_policy_changed',
    targetType: 'plugin',
    targetId: id,
    visibility: 'admin',
    summary: `Plugin ${id} access policy set to "${body.accessPolicy}"`,
    metadata: { pluginId: id, accessPolicy: body.accessPolicy, selfService },
  });

  return NextResponse.json({ pluginId: id, accessPolicy: body.accessPolicy, selfService });
}
