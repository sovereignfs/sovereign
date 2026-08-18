import type { GrantResolver } from '@sovereignfs/sdk';

/**
 * In-process registry of plugin grant resolvers (RFC 0054), keyed by plugin
 * id. Populated when a plugin calls `sdk.authz.provide()` from its
 * request-scoped server code; read by `sdk.authz.hasGrant()`/`requireGrant()`.
 *
 * Stored on `globalThis` under a `Symbol.for` key (not a module-level Map),
 * matching `runtime/src/portability/registry.ts` — Next.js bundles
 * instrumentation, route handlers, and server actions separately, so a
 * module-level singleton could be written in one bundle and read as empty in
 * another. A `Symbol.for`-keyed global is shared across every module instance
 * in the process. Resets on restart — a plugin re-registers on next request,
 * same as portability's exporters/importers/deleters.
 */
const REGISTRY_KEY = Symbol.for('@sovereignfs/runtime:authz-registry');

interface RegistryHolder {
  [REGISTRY_KEY]?: Map<string, GrantResolver>;
}

function registry(): Map<string, GrantResolver> {
  const holder = globalThis as unknown as RegistryHolder;
  return (holder[REGISTRY_KEY] ??= new Map<string, GrantResolver>());
}

export function registerGrantResolver(pluginId: string, resolver: GrantResolver): void {
  registry().set(pluginId, resolver);
}

export function getGrantResolver(pluginId: string): GrantResolver | undefined {
  return registry().get(pluginId);
}

/** Test helper — clear all registrations. */
export function clearAuthzRegistry(): void {
  registry().clear();
}
