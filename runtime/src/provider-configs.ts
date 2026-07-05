import { getPluginProviderConfig, getPluginSecret, markPluginSecretUsed } from '@sovereignfs/db';
import { toEnvVarName, type SovereignManifest } from '@sovereignfs/manifest';
import type { ProviderConfig, ProviderConfigSource } from '@sovereignfs/sdk';
import { getPlatformDb } from './db';
import { decryptSecretValue } from './secrets';
import { normalizeProvider } from './connections';

type ProviderDeclaration = NonNullable<SovereignManifest['connections']>['providers'][number];
type ProviderConfigDeclaration = NonNullable<ProviderDeclaration['config']>;
type FieldDeclaration = NonNullable<ProviderConfigDeclaration['public']>[string];

export interface ProviderConfigFieldView extends FieldDeclaration {
  key: string;
  envVar: string;
}

export interface ProviderConfigView {
  id: string | null;
  pluginId: string;
  pluginName: string;
  provider: string;
  label: string;
  callbackUrl: string | null;
  callbackPath: string;
  scopes: readonly string[];
  publicFields: ProviderConfigFieldView[];
  secretFields: ProviderConfigFieldView[];
  publicValues: Record<string, string>;
  hasSecretValues: boolean;
  status: 'configured' | 'error' | 'missing';
  lastCheckedAt: number | null;
  lastError: string | null;
  source: ProviderConfigSource;
  configured: boolean;
  missingRequired: readonly string[];
}

export function fieldKeyToEnvKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase();
}

function fieldViews(
  pluginId: string,
  fields: Record<string, FieldDeclaration> | undefined,
): ProviderConfigFieldView[] {
  return Object.entries(fields ?? {}).map(([key, declaration]) => {
    const envKey = declaration.env ?? fieldKeyToEnvKey(key);
    return { key, ...declaration, envVar: toEnvVarName(pluginId, envKey, 'runtime') };
  });
}

export function providerCallbackUrl(
  origin: string,
  manifest: SovereignManifest,
  provider: ProviderDeclaration,
): string {
  return new URL(`${manifest.routePrefix}${provider.callbackPath}`, origin).toString();
}

export function parseProviderConfigRecord(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

export function parseProviderScopes(
  raw: string | null,
  fallback: readonly string[],
): readonly string[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((scope): scope is string => typeof scope === 'string')
      : fallback;
  } catch {
    return fallback;
  }
}

export function stringifyProviderConfigRecord(values: Record<string, string>): string | null {
  const cleaned = Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
  if (Object.keys(cleaned).length === 0) return null;
  const json = JSON.stringify(cleaned);
  if (json.length > 8192) throw new Error('Provider config values must be 8 KiB or smaller.');
  return json;
}

async function readSecretValues(
  secretRef: string | null,
  context: { tenantId: string; pluginId: string },
): Promise<Record<string, string>> {
  if (!secretRef) return {};
  const pdb = await getPlatformDb();
  const secret = await getPluginSecret(pdb, secretRef, {
    tenantId: context.tenantId,
    pluginId: context.pluginId,
    userId: null,
  });
  if (!secret) return {};
  const plaintext = decryptSecretValue(secret.ciphertext, {
    tenantId: context.tenantId,
    pluginId: context.pluginId,
    scope: 'instance',
    userId: null,
  });
  await markPluginSecretUsed(pdb, secretRef, {
    tenantId: context.tenantId,
    pluginId: context.pluginId,
    userId: null,
  });
  return parseProviderConfigRecord(plaintext);
}

function envValues(fields: ProviderConfigFieldView[]): {
  values: Record<string, string>;
  hasValues: boolean;
} {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = process.env[field.envVar]?.trim();
    if (value) values[field.key] = value;
  }
  return { values, hasValues: Object.keys(values).length > 0 };
}

function sourceFor(hasEnv: boolean, hasConsole: boolean): ProviderConfigSource {
  if (hasEnv && hasConsole) return 'mixed';
  if (hasConsole) return 'console';
  if (hasEnv) return 'env';
  return 'missing';
}

export async function resolveProviderConfig(input: {
  tenantId: string;
  manifest: SovereignManifest;
  provider: ProviderDeclaration;
  origin?: string;
  includeSecrets: boolean;
}): Promise<
  ProviderConfig & {
    id: string | null;
    status: 'configured' | 'error' | 'missing';
    lastCheckedAt: number | null;
    lastError: string | null;
  }
> {
  const providerId = normalizeProvider(input.provider.id);
  const publicFields = fieldViews(input.manifest.id, input.provider.config?.public);
  const secretFields = fieldViews(input.manifest.id, input.provider.config?.secrets);
  const publicFromEnv = envValues(publicFields);
  const secretFromEnv = envValues(secretFields);
  const row = await getPluginProviderConfig(
    await getPlatformDb(),
    input.tenantId,
    input.manifest.id,
    providerId,
  );
  const publicFromConsole = parseProviderConfigRecord(row?.publicConfig ?? null);
  const secretFromConsole = input.includeSecrets
    ? await readSecretValues(row?.secretRef ?? null, {
        tenantId: input.tenantId,
        pluginId: input.manifest.id,
      })
    : {};
  const publicValues = { ...publicFromEnv.values, ...publicFromConsole };
  const secretValues = input.includeSecrets
    ? { ...secretFromEnv.values, ...secretFromConsole }
    : {};
  const missingPublicFields = publicFields
    .filter((field) => field.required === true)
    .filter((field) => !(field.key in publicValues))
    .map((field) => field.key);
  const missingSecretFields = secretFields
    .filter((field) => field.required === true)
    .filter((field) => {
      if (field.key in secretValues) return false;
      return input.includeSecrets || row?.secretRef === null || row?.secretRef === undefined;
    })
    .map((field) => field.key);
  const missingRequired = [...missingPublicFields, ...missingSecretFields];
  const hasConsoleValues =
    row !== undefined &&
    (Object.keys(publicFromConsole).length > 0 ||
      row.secretRef !== null ||
      row.callbackUrl !== null);
  const hasEnvValues = publicFromEnv.hasValues || secretFromEnv.hasValues;

  return {
    id: row?.id ?? null,
    provider: providerId,
    label: row?.label ?? input.provider.title,
    configured: missingRequired.length === 0 && (hasConsoleValues || hasEnvValues),
    source: sourceFor(hasEnvValues, hasConsoleValues),
    publicValues,
    secretValues,
    callbackUrl:
      row?.callbackUrl ??
      (input.origin ? providerCallbackUrl(input.origin, input.manifest, input.provider) : null),
    scopes: parseProviderScopes(row?.scopes ?? null, input.provider.scopes),
    missingRequired,
    status: row?.status ?? 'missing',
    lastCheckedAt: row?.lastCheckedAt ?? null,
    lastError: row?.lastError ?? null,
  };
}

export async function providerConfigView(input: {
  tenantId: string;
  manifest: SovereignManifest;
  provider: ProviderDeclaration;
  origin: string;
}): Promise<ProviderConfigView> {
  const effective = await resolveProviderConfig({ ...input, includeSecrets: false });
  const publicFields = fieldViews(input.manifest.id, input.provider.config?.public);
  const secretFields = fieldViews(input.manifest.id, input.provider.config?.secrets);
  const row = effective.id
    ? await getPluginProviderConfig(
        await getPlatformDb(),
        input.tenantId,
        input.manifest.id,
        effective.provider,
      )
    : undefined;
  return {
    id: effective.id,
    pluginId: input.manifest.id,
    pluginName: input.manifest.name,
    provider: effective.provider,
    label: effective.label,
    callbackUrl: effective.callbackUrl,
    callbackPath: input.provider.callbackPath,
    scopes: input.provider.scopes,
    publicFields,
    secretFields,
    publicValues: effective.publicValues,
    hasSecretValues: row?.secretRef !== null && row?.secretRef !== undefined,
    status: effective.status,
    lastCheckedAt: effective.lastCheckedAt,
    lastError: effective.lastError,
    source: effective.source,
    configured: effective.configured,
    missingRequired: effective.missingRequired,
  };
}
