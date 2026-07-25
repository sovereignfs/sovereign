/**
 * In-memory boot-time compatibility state. Populated once by
 * `runtime/src/boot-compat.ts` during the instrumentation `register()` call,
 * before any request is served. Consumed by the admin plugins + health routes.
 *
 * Also used by `runtime/src/plugin-migrations.ts`'s `assertPluginEncryptionRequirement`
 * to record its Postgres-fallback warning (RFC 0071: a plugin's
 * `requireEncryption` degrading to advisory-only because it resolved to
 * Postgres) — previously a bare `console.warn` that vanished from anywhere an
 * operator would look after boot. Recording it here means it shows up in
 * Console's plugin list the same way a version-compatibility warning does.
 */

const _reasons = new Map<string, string>();
const _warnings = new Map<string, string[]>();

/** Mark a plugin as incompatible with the current platform. Called at boot. */
export function markIncompatible(pluginId: string, reason: string): void {
  _reasons.set(pluginId, reason);
}

/**
 * Record advisory warnings for a plugin. Called at boot — potentially more
 * than once per plugin from different checks (version-compatibility,
 * encryption-requirement fallback, ...), so this accumulates rather than
 * overwrites; a later call must never silently erase an earlier one's warning.
 */
export function recordWarnings(pluginId: string, warnings: string[]): void {
  if (warnings.length === 0) return;
  const existing = _warnings.get(pluginId) ?? [];
  _warnings.set(pluginId, [...existing, ...warnings]);
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
