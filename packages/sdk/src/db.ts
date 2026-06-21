import { headers } from 'next/headers';
import { requireHost } from './host';
import type { DrizzleClient } from './types';

/**
 * Returns the Drizzle client for this plugin's database.
 *
 * **Shared plugins** (the default, `database` omitted or `"shared"`) receive
 * the platform DB. Tables must be slug-prefixed (e.g. `tasks_lists`) and carry
 * a `tenant_id` column. `sdk.db.getClient()` is unchanged for these plugins —
 * isolation is transparent to the caller.
 *
 * **Isolated plugins** (`database: "isolated"` in the manifest) receive a
 * dedicated Drizzle instance backed by their own SQLite file or Postgres
 * schema. No slug prefix is required inside an isolated store. Tables should
 * still carry `tenant_id` for multi-tenancy readiness.
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
