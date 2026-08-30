/**
 * Returns the fully-namespaced data-contract name for a plugin-declared
 * `sdk.data` contract.
 *
 * The platform auto-namespaces every local contract name to
 * `<pluginId>:<contract>`, mirroring `pluginToolName`/`pluginCapabilityName`
 * — keeps two plugins from ever colliding on the same local contract name
 * without the plugin author having to coordinate across the ecosystem.
 *
 * @example
 * pluginContractName('com.acme.myapp', 'expenses')
 * // → 'com.acme.myapp:expenses'
 */
export function pluginContractName(pluginId: string, contract: string): string {
  return `${pluginId}:${contract}`;
}
