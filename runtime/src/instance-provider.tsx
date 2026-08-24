import type { ReactNode } from 'react';
import { getPlatformDb } from '@sovereignfs/db';
import { DEFAULT_TENANT_ID, getInstanceConfig, type InstanceConfig } from '@sovereignfs/db';
import { resolveInstanceName } from './instance-name';
import { buildInstanceStyle } from './instance-style';

export interface InstanceContext {
  instanceName: string;
  instanceLogoUrl: string | null;
  instanceLogoDarkUrl: string | null;
}

const ENV_FALLBACK_CONFIG: InstanceConfig = {
  instanceName: resolveInstanceName(process.env.INSTANCE_NAME),
  instanceLogo: process.env.INSTANCE_LOGO ?? null,
  instanceLogoDark: process.env.INSTANCE_LOGO_DARK ?? null,
  instanceFavicon: process.env.INSTANCE_FAVICON ?? null,
  instancePrimary: null,
  instanceRadius: null,
  instanceThemePreset: null,
  emailFromName: null,
  emailLogo: null,
};

/**
 * Reads instance config from DB, merged with INSTANCE_* env defaults.
 * Instance config is cosmetic — never throws on a failed DB read, falls
 * back to env-only config instead. Shared by `InstanceProvider` (below) and
 * by pages needing just the config for `generateMetadata` (which can't use
 * `InstanceProvider`'s JSX — Next calls it outside any render tree).
 */
export async function resolveInstanceConfig(): Promise<InstanceConfig> {
  try {
    const pdb = await getPlatformDb();
    return await getInstanceConfig(pdb, DEFAULT_TENANT_ID);
  } catch {
    return ENV_FALLBACK_CONFIG;
  }
}

interface InstanceProviderProps {
  children: (ctx: InstanceContext) => ReactNode;
}

/**
 * Server component — resolves instance config (see `resolveInstanceConfig`),
 * injects CSS custom properties via an inline <style> block, and passes the
 * instance name (and resolved logo URLs) as render-prop children so the shell
 * chrome can render text without reading CSS variables.
 */
export async function InstanceProvider({ children }: InstanceProviderProps): Promise<ReactNode> {
  const config = await resolveInstanceConfig();
  const styleContent = buildInstanceStyle(config);
  const ctx: InstanceContext = {
    instanceName: config.instanceName,
    instanceLogoUrl: config.instanceLogo,
    instanceLogoDarkUrl: config.instanceLogoDark,
  };

  return (
    <>
      {styleContent ? <style dangerouslySetInnerHTML={{ __html: styleContent }} /> : null}
      {children(ctx)}
    </>
  );
}
