import { requireHost } from './host';
import type { PlatformConfig } from './types';

/**
 * Returns the platform runtime configuration (SRS PLT-06). Async by contract:
 * the platform DB is dialect-agnostic and Postgres has no synchronous query.
 */
export async function getConfig(): Promise<PlatformConfig> {
  return requireHost().platform.getConfig();
}
