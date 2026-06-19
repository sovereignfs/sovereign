import { headers } from 'next/headers';

/**
 * Plugin-scoped environment variables (RFC 0018).
 *
 * `sdk.env.get(key)` reads the calling plugin's `SV_PLUGIN_<SLUG>_<KEY>`
 * environment variable, identified by the `x-sovereign-plugin-id` header
 * that the runtime middleware injects on every plugin route request. Returns
 * `null` when the variable is absent or the call is made outside a plugin
 * route context (no `x-sovereign-plugin-id` header).
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
    const h = await headers();
    const pluginId = h.get('x-sovereign-plugin-id');
    if (!pluginId) return null;
    const slug = pluginId.replace(/[.-]/g, '_').toUpperCase();
    return process.env[`SV_PLUGIN_${slug}_${key}`] ?? null;
  },
};
