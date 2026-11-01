import type { InstanceBranding } from '@sovereignfs/api-client';
import type { InstanceIdentity } from './identity';

/**
 * What this core serves (core-app §3.13): the API versions and the groups of calls, a group being listed when every
 * call of it is served. An app reads it to tell a capability this core lacks from a failure (sdk §7). It grows when a
 * capability does. `email` is not here: it is listed only while the instance can send mail (`brandingDocument`).
 */
export const SERVED_API = {
  versions: ['v1'],
  capabilities: ['directory', 'notifications', 'activity'],
} as const satisfies {
  versions: readonly string[];
  capabilities: readonly string[];
};

/**
 * The instance's branding as the Core API publishes it (`getInstanceBranding` in `contracts/core-api/openapi.yaml`):
 * what an app needs to look like it belongs to this instance. Typed from the contract, so a field the contract
 * does not have does not compile. The pictures are absolute addresses on the instance, which carry the picture's
 * version, so a changed picture is a new address; when only one logo is set it is given for both.
 */
export function brandingDocument(
  identity: InstanceIdentity,
  baseUrl: string,
  /** Whether this instance can send mail, which is what makes `email` a capability (core-app §4.2). */
  served: { email?: boolean } = {},
): InstanceBranding {
  const origin = new URL(baseUrl).origin;
  const absolute = (path: string | undefined) => (path ? new URL(path, origin).toString() : null);
  return {
    name: identity.name,
    url: origin,
    logo: { light: absolute(identity.logoLight), dark: absolute(identity.logoDark) },
    favicon: absolute(identity.favicon),
    api: {
      versions: [...SERVED_API.versions],
      capabilities: [...SERVED_API.capabilities, ...(served.email ? (['email'] as const) : [])],
    },
  };
}
