/**
 * In-memory boot-time compatibility state. Populated once by
 * `runtime/src/boot-compat.ts` during the instrumentation `register()` call,
 * before any request is served. Consumed by the admin plugins + health routes.
 */

const _reasons = new Map<string, string>();
const _warnings = new Map<string, string[]>();

/** Mark a plugin as incompatible with the current platform. Called at boot. */
export function markIncompatible(pluginId: string, reason: string): void {
  _reasons.set(pluginId, reason);
}

/** Record advisory max-version warnings for a plugin. Called at boot. */
export function recordWarnings(pluginId: string, warnings: string[]): void {
  if (warnings.length > 0) _warnings.set(pluginId, warnings);
}

/** Returns the incompatibility reason for a plugin, or null if compatible. */
export function getIncompatibilityReason(pluginId: string): string | null {
  return _reasons.get(pluginId) ?? null;
}

/** Returns advisory warnings for a plugin (may be empty). */
export function getCompatibilityWarnings(pluginId: string): string[] {
  return _warnings.get(pluginId) ?? [];
}

/** Returns all incompatible plugin IDs and their reasons (for health reports). */
export function getIncompatiblePlugins(): ReadonlyMap<string, string> {
  return _reasons;
}
