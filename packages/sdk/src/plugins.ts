import { headers } from 'next/headers';
import type { DataContractRef } from './data';
import { requireHost } from './host';

function parseCapabilities(raw: string | null): readonly string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((cap): cap is string => typeof cap === 'string')
      : [];
  } catch {
    return [];
  }
}

/** A data contract a plugin declares in its manifest `data.provides`. */
export interface PluginContractSummary {
  contract: string;
  version: number;
}

/**
 * Discovery status of an installed plugin, scoped to the requesting user
 * (RFC 0051). Never exposes private provider data — only install/enable
 * status, launch availability, and declared (not consented) contracts.
 */
export interface PluginAvailability {
  id: string;
  name: string;
  routePrefix: string;
  icon?: string;
  /** Always `true` — `get()`/`list()` only ever return installed plugins. */
  installed: true;
  /** Whether the plugin is enabled instance-wide (Console toggle / example default). */
  enabled: boolean;
  /**
   * Whether the *current* user could launch this plugin right now: enabled,
   * not blocked by an `adminOnly` gate the user lacks `console:access` for,
   * and not paywalled by an unmet entitlement (RFC 0003). `false` when called
   * without an authenticated user in context.
   */
  availableToUser: boolean;
  /** Data contracts this plugin exposes (`data.provides`), if any. */
  providesContracts: PluginContractSummary[];
}

export interface PluginListFilter {
  /** Only return plugins that declare this contract name in `data.provides`. */
  providesContract?: string;
}

/**
 * Whether the current user has an active consent grant for a (consumer,
 * provider, contract, version) tuple. `'not_granted'` covers both "never
 * granted" and "revoked" — the platform does not distinguish the two once a
 * grant is inactive; a consumer that needs to tell them apart should compare
 * against its own last-known cached state.
 */
export type ConsentStatus = 'granted' | 'not_granted';

/**
 * A standard, opaque reference to another plugin's record (RFC 0051). Store
 * this shape (or split it into columns) in your own tables to point at a
 * sibling plugin's data without a direct foreign key or copying private data.
 * `resourceId` is opaque to the consumer — the provider decides its shape.
 *
 * References are never authorization: every dereference still goes through
 * `sdk.data.query()` (or a tool contract) and the current user's live
 * consent. Treat a stored reference as a nullable link — the provider may be
 * uninstalled, disabled, have revoked consent, or have deleted the resource.
 */
export interface PluginReference {
  /** The provider plugin's manifest `id`. */
  providerId: string;
  /** Provider-local resource kind (e.g. `"contact"`, `"invoice"`). */
  resourceType: string;
  /** Opaque to the consumer — a UUID, slug, or compound key the provider defines. */
  resourceId: string;
  /** The data contract this reference was resolved through, if any. */
  contract?: string;
  /** Contract major version at the time this reference was captured. */
  version?: number;
  /** A cached, possibly-stale display label — show it when the provider is unavailable. */
  labelSnapshot?: string;
  /** Consumer-defined extra metadata. */
  metadata?: unknown;
  /** ISO-8601 timestamp of when this reference was created. */
  linkedAt: string;
}

async function requestContext(): Promise<{
  userId: string | null;
  capabilities: readonly string[];
}> {
  const h = await headers();
  return {
    userId: h.get('x-sovereign-user-id'),
    capabilities: parseCapabilities(h.get('x-sovereign-user-capabilities')),
  };
}

/**
 * Plugin dependency discovery and cross-plugin references (RFC 0051).
 *
 * Lets a plugin check whether an optional sibling plugin is installed,
 * enabled, and available to the current user before offering an integration,
 * and defines the standard `PluginReference` shape for storing opaque links
 * to another plugin's records. Complements `sdk.data` (RFC 0002, which reads
 * the data) and RFC 0047 plugin tools (which act on it).
 *
 * ```ts
 * const crm = await sdk.plugins.get('io.openfs.sovereign.crm');
 * if (crm?.availableToUser) {
 *   // offer a "Link to contact" action
 * }
 *
 * const status = await sdk.plugins.getConsentStatus({
 *   providerId: 'io.openfs.sovereign.crm',
 *   contract: 'crm.contacts',
 *   version: 1,
 * });
 * ```
 */
export const plugins = {
  /** Discover one installed plugin's status. `null` when not installed. */
  async get(id: string): Promise<PluginAvailability | null> {
    const { userId, capabilities } = await requestContext();
    return requireHost().plugins.get(id, userId, capabilities);
  },

  /** Discover installed plugins, optionally filtered to those providing a contract. */
  async list(filter?: PluginListFilter): Promise<PluginAvailability[]> {
    const { userId, capabilities } = await requestContext();
    return requireHost().plugins.list(filter, userId, capabilities);
  },

  /** Whether the current user has granted this plugin's requested data contract. */
  async getConsentStatus(ref: DataContractRef): Promise<ConsentStatus> {
    const h = await headers();
    const consumerId = h.get('x-sovereign-plugin-id');
    const userId = h.get('x-sovereign-user-id');
    if (!consumerId || !userId) return 'not_granted';
    return requireHost().plugins.getConsentStatus(ref, consumerId, userId);
  },
};
