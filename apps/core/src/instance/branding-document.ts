import type { InstanceBranding } from '@sovereignfs/api-client';
import type { InstanceIdentity } from './identity';

/**
 * The instance's branding as the Core API publishes it (`getInstanceBranding` in `spec/core-api/openapi.yaml`):
 * what an app needs to look like it belongs to this instance. Typed from the contract, so a field the contract
 * does not have does not compile. The pictures are absolute addresses on the instance, which carry the picture's
 * version, so a changed picture is a new address; when only one logo is set it is given for both.
 */
export function brandingDocument(identity: InstanceIdentity, baseUrl: string): InstanceBranding {
  const origin = new URL(baseUrl).origin;
  const absolute = (path: string | undefined) => (path ? new URL(path, origin).toString() : null);
  return {
    name: identity.name,
    url: origin,
    logo: { light: absolute(identity.logoLight), dark: absolute(identity.logoDark) },
    favicon: absolute(identity.favicon),
  };
}
