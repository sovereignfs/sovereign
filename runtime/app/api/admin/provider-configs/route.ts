import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  createPluginSecret,
  deletePluginSecret,
  getPluginProviderConfig,
  upsertPluginProviderConfig,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { normalizeProvider } from '@/src/connections';
import { getPlatformDb } from '@/src/db';
import {
  providerCallbackUrl,
  providerConfigView,
  stringifyProviderConfigRecord,
  resolveProviderConfig,
} from '@/src/provider-configs';
import { encryptSecretValue, metadataToJson, normalizeSecretLabel } from '@/src/secrets';
import { registry } from '@/generated/registry';

const DEFAULT_TENANT_ID = 'default';

interface ProviderConfigRequest {
  pluginId?: string;
  provider?: string;
  publicValues?: Record<string, unknown>;
  secretValues?: Record<string, unknown>;
}

function declaredProvider(pluginId: string, provider: string) {
  const manifest = registry.find((candidate) => candidate.id === pluginId);
  const providerId = normalizeProvider(provider);
  const declaration = manifest?.connections?.providers.find(
    (candidate) => candidate.id === providerId && candidate.config !== undefined,
  );
  return manifest && declaration ? { manifest, declaration, providerId } : null;
}

function pickValues(
  values: Record<string, unknown> | undefined,
  allowed: readonly string[],
): Record<string, string> {
  const allowedSet = new Set(allowed);
  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (allowedSet.has(key) && typeof value === 'string' && value.trim().length > 0) {
      picked[key] = value.trim();
    }
  }
  return picked;
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  const origin = new URL(request.url).origin;
  const providers = await Promise.all(
    registry.flatMap((manifest) =>
      (manifest.connections?.providers ?? [])
        .filter((provider) => provider.config !== undefined)
        .map((provider) =>
          providerConfigView({ tenantId: DEFAULT_TENANT_ID, manifest, provider, origin }),
        ),
    ),
  );
  return NextResponse.json({ providers });
}

export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as ProviderConfigRequest | null;
  if (!body?.pluginId || !body.provider) {
    return NextResponse.json({ error: 'pluginId and provider are required' }, { status: 400 });
  }
  const found = declaredProvider(body.pluginId, body.provider);
  if (!found) {
    return NextResponse.json({ error: 'Provider config declaration not found' }, { status: 404 });
  }

  const publicKeys = Object.keys(found.declaration.config?.public ?? {});
  const secretKeys = Object.keys(found.declaration.config?.secrets ?? {});
  const publicValues = pickValues(body.publicValues, publicKeys);
  const secretValues = pickValues(body.secretValues, secretKeys);
  const pdb = await getPlatformDb();
  const existing = await getPluginProviderConfig(
    pdb,
    DEFAULT_TENANT_ID,
    found.manifest.id,
    found.providerId,
  );

  let secretRef: string | null | undefined = undefined;
  if (Object.keys(secretValues).length > 0) {
    const secretId = randomUUID();
    await createPluginSecret(pdb, {
      id: secretId,
      tenantId: DEFAULT_TENANT_ID,
      pluginId: found.manifest.id,
      userId: null,
      scope: 'instance',
      label: normalizeSecretLabel(`${found.declaration.title} provider credentials`),
      ciphertext: encryptSecretValue(JSON.stringify(secretValues), {
        tenantId: DEFAULT_TENANT_ID,
        pluginId: found.manifest.id,
        scope: 'instance',
        userId: null,
      }),
      metadata: metadataToJson({
        kind: 'provider_config',
        provider: found.providerId,
        fields: Object.keys(secretValues),
      }),
    });
    secretRef = secretId;
  }

  const row = await upsertPluginProviderConfig(pdb, {
    id: existing?.id ?? randomUUID(),
    tenantId: DEFAULT_TENANT_ID,
    pluginId: found.manifest.id,
    provider: found.providerId,
    label: found.declaration.title,
    publicConfig: stringifyProviderConfigRecord(publicValues),
    secretRef,
    callbackUrl: providerCallbackUrl(
      new URL(request.url).origin,
      found.manifest,
      found.declaration,
    ),
    scopes: JSON.stringify(found.declaration.scopes),
  });
  if (secretRef && existing?.secretRef) {
    await deletePluginSecret(pdb, existing.secretRef, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: found.manifest.id,
      userId: null,
    });
  }
  const effective = await resolveProviderConfig({
    tenantId: DEFAULT_TENANT_ID,
    manifest: found.manifest,
    provider: found.declaration,
    origin: new URL(request.url).origin,
    includeSecrets: true,
  });
  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'settings.provider_config_saved',
    targetType: 'plugin_provider_config',
    targetId: row.id,
    pluginId: found.manifest.id,
    visibility: 'admin',
    summary: `Provider config saved: ${found.declaration.title}`,
    metadata: {
      pluginId: found.manifest.id,
      provider: found.providerId,
      publicFields: Object.keys(publicValues),
      secretFields: Object.keys(secretValues),
      source: effective.source,
      missingRequired: effective.missingRequired,
    },
  });
  const view = await providerConfigView({
    tenantId: DEFAULT_TENANT_ID,
    manifest: found.manifest,
    provider: found.declaration,
    origin: new URL(request.url).origin,
  });
  return NextResponse.json({ provider: view });
}
