import { requireHost } from './host';
import type { DrizzleClient } from './types';

/**
 * Returns the platform's Drizzle client. Plugins query their own slug-prefixed
 * tables (e.g. `tasks_lists`) through it; scoping in v1 is by table-name prefix
 * plus the `tenant_id` column convention, not query-level auto-scoping (SRS
 * §3.6, §3.1). Async by contract: the platform DB is dialect-agnostic and
 * Postgres (node-postgres) has no synchronous query (on SQLite the underlying
 * reads complete synchronously).
 */
export async function getClient(): Promise<DrizzleClient> {
  return requireHost().db.getClient();
}
