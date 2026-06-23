import type { DeletionHandler, ExportResolver, ImportHandler } from '@sovereignfs/sdk';

/**
 * In-process registry of plugin portability resolvers (RFC 0007), keyed by
 * plugin id. Populated when a plugin calls `sdk.portability.provideExport` /
 * `provideImport` from its request-scoped server code; read by the export
 * assembler and import restorer.
 *
 * Stored on `globalThis` under a `Symbol.for` key (not a module-level Map) for
 * the same reason as the SDK host: Next.js bundles instrumentation, route
 * handlers, and server actions separately, so a module-level singleton could be
 * written in one bundle and read as empty in another. A `Symbol.for`-keyed
 * global is shared across every module instance in the process. Resets on
 * restart.
 */
interface PortabilityEntry {
  exporter?: ExportResolver;
  importer?: ImportHandler;
  deleter?: DeletionHandler;
}

const REGISTRY_KEY = Symbol.for('@sovereignfs/runtime:portability-registry');

interface RegistryHolder {
  [REGISTRY_KEY]?: Map<string, PortabilityEntry>;
}

function registry(): Map<string, PortabilityEntry> {
  const holder = globalThis as unknown as RegistryHolder;
  return (holder[REGISTRY_KEY] ??= new Map<string, PortabilityEntry>());
}

export function registerExporter(pluginId: string, resolver: ExportResolver): void {
  const entry = registry().get(pluginId) ?? {};
  entry.exporter = resolver;
  registry().set(pluginId, entry);
}

export function registerImporter(pluginId: string, handler: ImportHandler): void {
  const entry = registry().get(pluginId) ?? {};
  entry.importer = handler;
  registry().set(pluginId, entry);
}

export function getExporter(pluginId: string): ExportResolver | undefined {
  return registry().get(pluginId)?.exporter;
}

export function getImporter(pluginId: string): ImportHandler | undefined {
  return registry().get(pluginId)?.importer;
}

export function registerDeleter(pluginId: string, handler: DeletionHandler): void {
  const entry = registry().get(pluginId) ?? {};
  entry.deleter = handler;
  registry().set(pluginId, entry);
}

export function getDeleter(pluginId: string): DeletionHandler | undefined {
  return registry().get(pluginId)?.deleter;
}

/** Returns all registered deletion handlers as [pluginId, handler] pairs. */
export function getAllDeleters(): [string, DeletionHandler][] {
  const result: [string, DeletionHandler][] = [];
  for (const [pluginId, entry] of registry()) {
    if (entry.deleter) result.push([pluginId, entry.deleter]);
  }
  return result;
}

/** Test helper — clear all registrations. */
export function clearPortabilityRegistry(): void {
  registry().clear();
}
