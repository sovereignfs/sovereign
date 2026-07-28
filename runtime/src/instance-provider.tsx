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

interface InstanceProviderProps {
  children: (ctx: InstanceContext) => ReactNode;
}

/**
 * Server component — reads instance config from DB (merged with INSTANCE_* env),
 * injects CSS custom properties via an inline <style> block, and passes the
 * instance name (and resolved logo URLs) as render-prop children so the shell
 * chrome can render text without reading CSS variables.
 */
export async function InstanceProvider({ children }: InstanceProviderProps): Promise<ReactNode> {
  let config: InstanceConfig;
  try {
    const pdb = await getPlatformDb();
    config = await getInstanceConfig(pdb, DEFAULT_TENANT_ID);
  } catch {
    // Instance config is cosmetic — never crash on a failed DB read.
    config = {
      instanceName: resolveInstanceName(process.env.INSTANCE_NAME),
      instanceLogo: process.env.INSTANCE_LOGO ?? null,
      instanceLogoDark: process.env.INSTANCE_LOGO_DARK ?? null,
      instanceFavicon: process.env.INSTANCE_FAVICON ?? null,
      instancePrimary: null,
      instanceRadius: null,
      emailFromName: null,
      emailLogo: null,
    };
  }

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
