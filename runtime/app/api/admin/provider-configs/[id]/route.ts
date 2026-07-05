import { NextResponse } from 'next/server';
import {
  deletePluginProviderConfig,
  listAllPluginProviderConfigs,
  markPluginProviderConfigChecked,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
import { resolveProviderConfig } from '@/src/provider-configs';
import { registry } from '@/generated/registry';

const DEFAULT_TENANT_ID = 'default';

interface Params {
  params: Promise<{ id: string }>;
}

async function loadConfig(id: string) {
  const pdb = await getPlatformDb();
  const all = await listAllPluginProviderConfigs(pdb, DEFAULT_TENANT_ID);
  return all.find((config) => config.id === id);
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  const { id } = await params;
  const config = await loadConfig(id);
  if (!config) return NextResponse.json({ error: 'Provider config not found' }, { status: 404 });
  const manifest = registry.find((candidate) => candidate.id === config.pluginId);
  const provider = manifest?.connections?.providers.find(
    (candidate) => candidate.id === config.provider && candidate.config !== undefined,
  );
  if (!manifest || !provider) {
    return NextResponse.json({ error: 'Provider declaration not found' }, { status: 404 });
  }
  const effective = await resolveProviderConfig({
    tenantId: DEFAULT_TENANT_ID,
    manifest,
    provider,
    origin: new URL(request.url).origin,
    includeSecrets: true,
  });
  const error =
    effective.missingRequired.length > 0
      ? `Missing required fields: ${effective.missingRequired.join(', ')}`
      : null;
  const row = await markPluginProviderConfigChecked(
    await getPlatformDb(),
    id,
    DEFAULT_TENANT_ID,
    error,
  );
  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'settings.provider_config_tested',
    targetType: 'plugin_provider_config',
    targetId: id,
    pluginId: config.pluginId,
    visibility: 'admin',
    summary: `Provider config test ${error ? 'failed' : 'passed'}: ${config.label}`,
    metadata: {
      provider: config.provider,
      ok: error === null,
      missingRequired: effective.missingRequired,
    },
  });
  return NextResponse.json({
    ok: error === null,
    error,
    provider: row ? { id: row.id, status: row.status, lastCheckedAt: row.lastCheckedAt } : null,
  });
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  const { id } = await params;
  const row = await deletePluginProviderConfig(await getPlatformDb(), id, DEFAULT_TENANT_ID);
  if (!row) return NextResponse.json({ error: 'Provider config not found' }, { status: 404 });
  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'settings.provider_config_removed',
    targetType: 'plugin_provider_config',
    targetId: id,
    pluginId: row.pluginId,
    visibility: 'admin',
    summary: `Provider config removed: ${row.label}`,
    metadata: { provider: row.provider },
  });
  return NextResponse.json({ ok: true });
}
