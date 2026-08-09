import { headers } from 'next/headers';
import { requireHost } from './host';
import type { DrizzleClient } from './types';

/**
 * Returns the Drizzle client for this plugin's database.
 *
 * Every `sovereign`/`community` plugin is unconditionally isolated — a
 * dedicated Drizzle instance backed by its own SQLite file or Postgres
 * schema. No slug prefix is required; tables should still carry `tenant_id`
 * for multi-tenancy readiness. There is no per-plugin choice anymore (the
 * `database.isolation`/`"shared"` manifest option was retired) — this call
 * is identical for every plugin, isolation is transparent to the caller.
 *
 * `type: "platform"` plugins (`account`, `console`, `launcher`) are the one
 * exception: they receive the platform DB directly, since they administer
 * the platform's own core data rather than owning data of their own — see
 * `docs/plugin-database.md`.
 *
 * The plugin ID is read from the `x-sovereign-plugin-id` request header
 * injected by the runtime middleware. Outside a plugin route context (e.g.
 * instrumentation startup code) the platform DB is returned.
 *
 * Async by contract: the platform DB is dialect-agnostic and Postgres has no
 * synchronous query (SRS §3.6).
 */
export async function getClient(): Promise<DrizzleClient> {
  let pluginId: string | null = null;
  try {
    const h = await headers();
    pluginId = h.get('x-sovereign-plugin-id');
  } catch {
    // Outside a Next.js request context — no plugin ID available.
  }
  return requireHost().db.getClient(pluginId);
}
