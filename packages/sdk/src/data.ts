import { headers } from 'next/headers';
import { ConsentRequiredError } from './errors';
import { requireHost } from './host';

// v1 is single-tenant.
const DEFAULT_TENANT_ID = 'default';

/**
 * A reference to a versioned data contract exposed by a *provider* plugin, used
 * by a *consumer* plugin to request it.
 */
export interface DataContractRef {
  /** The provider plugin's manifest `id`. */
  providerId: string;
  /** The named, read-only contract the provider exposes (e.g. `"expenses"`). */
  contract: string;
  /** Contract major version the consumer was built against. */
  version: number;
}

/**
 * A resolver a provider registers to answer read requests for one of its
 * contracts. The runtime invokes it only for consumers that hold an active
 * user consent grant, already scoped to the requesting user and tenant.
 */
export type DataContractResolver<TParams = unknown, TRow = unknown> = (
  params: TParams,
) => Promise<TRow[]>;

/**
 * Cross-plugin data sharing (RFC 0002) — consent-gated, pull-based, read-only
 * channel between plugins.
 *
 * **Provider** — register a resolver for each contract your plugin exposes
 * (declare it in the manifest `data.provides` array and add `data:provide` to
 * `permissions`):
 *
 * ```ts
 * sdk.data.provide('expenses', async ({ since }) => getExpenses({ since }));
 * ```
 *
 * **Consumer** — query a provider's contract (declare the contract in the
 * manifest `data.consumes` array and add `data:consume` to `permissions`).
 * Throws `ConsentRequiredError` when the current user has not yet granted
 * consent for this (consumer, provider, contract) triple:
 *
 * ```ts
 * const rows = await sdk.data.query(
 *   { providerId: 'com.example.finance', contract: 'expenses', version: 1 },
 *   { since: '2025-01-01' },
 * );
 * ```
 *
 * Consent is managed by the user in the Account → Data tab.
 */
export const data = {
  /**
   * Provider: register a resolver for one of the contracts this plugin exposes.
   * Call this before any consumer can query the contract — typically at the top
   * of a route handler or server component that runs when the plugin is loaded.
   * Registrations are in-process and reset on server restart.
   */
  provide<TParams = unknown, TRow = unknown>(
    contract: string,
    resolver: DataContractResolver<TParams, TRow>,
  ): void {
    requireHost().data.provide(contract, resolver as DataContractResolver);
  },

  /** Consumer: read a provider plugin's contract for the current user (consent-gated). */
  async query<TParams = unknown, TRow = unknown>(
    ref: DataContractRef,
    params?: TParams,
  ): Promise<TRow[]> {
    const h = await headers();
    const consumerId = h.get('x-sovereign-plugin-id');
    const userId = h.get('x-sovereign-user-id');
    if (!userId) throw new ConsentRequiredError();
    const result = await requireHost().data.query(
      ref,
      consumerId,
      userId,
      DEFAULT_TENANT_ID,
      params,
    );
    return result as TRow[];
  },
};
