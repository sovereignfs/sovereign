/**
 * Derives the environment-variable slug from a plugin ID. The slug is the
 * full reverse-DNS ID transformed for use in env-var names: dots and hyphens
 * become underscores, and the result is uppercased.
 *
 * @example
 * toEnvSlug('fs.my-plugin')   // → 'FS_MY_PLUGIN'
 * toEnvSlug('com.example.tasks') // → 'COM_EXAMPLE_TASKS'
 */
export function toEnvSlug(pluginId: string): string {
  return pluginId.replace(/[.-]/g, '_').toUpperCase();
}

/**
 * Returns the fully-namespaced environment-variable name for a plugin's
 * declared env key.
 *
 * - `scope: 'runtime'` → `SV_PLUGIN_<SLUG>_<KEY>` (server-side only)
 * - `scope: 'build'`   → `NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>` (inlined at build
 *   time by Next.js; accessible in client bundles — never use for secrets)
 *
 * @example
 * toEnvVarName('fs.my-plugin', 'API_KEY', 'runtime')
 * // → 'SV_PLUGIN_FS_MY_PLUGIN_API_KEY'
 *
 * toEnvVarName('fs.my-plugin', 'API_URL', 'build')
 * // → 'NEXT_PUBLIC_SV_PLUGIN_FS_MY_PLUGIN_API_URL'
 */
export function toEnvVarName(pluginId: string, key: string, scope: 'build' | 'runtime'): string {
  const base = `SV_PLUGIN_${toEnvSlug(pluginId)}_${key}`;
  return scope === 'build' ? `NEXT_PUBLIC_${base}` : base;
}
