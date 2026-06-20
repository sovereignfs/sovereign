/**
 * Returns the fully-namespaced capability name for a plugin-declared capability.
 *
 * The platform auto-namespaces every local capability key to
 * `<pluginId>:<capName>`, keeping plugin capability names globally unique
 * without the plugin author having to coordinate across the ecosystem.
 *
 * @example
 * pluginCapabilityName('com.acme.myapp', 'create-item')
 * // → 'com.acme.myapp:create-item'
 */
export function pluginCapabilityName(pluginId: string, capName: string): string {
  return `${pluginId}:${capName}`;
}
