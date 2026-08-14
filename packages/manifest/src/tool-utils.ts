import type { ToolDeclaration } from './types';

/**
 * Returns the fully-namespaced tool name for a plugin-declared tool.
 *
 * The platform auto-namespaces every local tool name to `<pluginId>:<name>`,
 * mirroring `pluginCapabilityName` — keeps plugin tool names globally unique
 * without the plugin author having to coordinate across the ecosystem.
 *
 * @example
 * pluginToolName('com.acme.myapp', 'create-record')
 * // → 'com.acme.myapp:create-record'
 */
export function pluginToolName(pluginId: string, toolName: string): string {
  return `${pluginId}:${toolName}`;
}

/**
 * Whether executing this tool requires a confirmation token from a prior
 * `preview()` call. Honours an explicit `requiresConfirmation`; otherwise
 * defaults to `false` for `read` (no mutation) and `true` for `write`/
 * `external` (RFC 0047's effect-class confirmation-default table).
 */
export function effectiveRequiresConfirmation(
  tool: Pick<ToolDeclaration, 'effect' | 'requiresConfirmation'>,
): boolean {
  return tool.requiresConfirmation ?? tool.effect !== 'read';
}
