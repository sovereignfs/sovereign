import { headers } from 'next/headers';
import { requireHost } from './host';

/**
 * Plugin-scoped environment variables (RFC 0018).
 *
 * `sdk.env.get(key)` reads the calling plugin's `SV_PLUGIN_<SLUG>_<KEY>`
 * environment variable, identified by the `x-sovereign-plugin-id` header
 * that the runtime middleware injects on every plugin route request — or,
 * inside a `sdk.jobs`/`sdk.schedules` handler (no real request), by that
 * handler's own background-invocation plugin context. Returns `null` when
 * the variable is absent or no plugin id is resolvable from either source.
 *
 * Declare the variable in the manifest `env` field:
 * ```json
 * "env": {
 *   "API_KEY": { "description": "Third-party API key", "secret": true, "scope": "runtime", "required": true }
 * }
 * ```
 *
 * Then read it in a Server Component or Route Handler:
 * ```ts
 * import { sdk } from '@sovereignfs/sdk';
 * const apiKey = await sdk.env.get('API_KEY');
 * ```
 *
 * For `scope: "build"` variables (NEXT_PUBLIC_SV_PLUGIN_*), read the env var
 * directly from `process.env` in client components — Next.js inlines NEXT_PUBLIC_*
 * vars at build time and sdk.env.get is server-only (it uses next/headers).
 */
export const env = {
  async get(key: string): Promise<string | null> {
    let pluginId: string | null = null;
    try {
      const h = await headers();
      pluginId = h.get('x-sovereign-plugin-id');
    } catch {
      // Outside a Next.js request context (e.g. a background job/schedule
      // handler) — the host falls back to its own background-invocation
      // context (same pattern as sdk.db.getClient()/sdk.storage).
    }
    return requireHost().env.get(key, pluginId);
  },
};
