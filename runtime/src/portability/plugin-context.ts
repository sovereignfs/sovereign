import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Tracks which plugin's export/import/resolver is currently running, for the
 * portability assembler/restorer (`assemble.ts` / `restore.ts`). Those call a
 * plugin's exporter/importer directly from `/api/account/export` and
 * `/api/account/import`, which are platform routes — `x-sovereign-plugin-id`
 * is never set on that request, so `sdk.db.getClient()` (which reads that
 * header) can't tell which plugin's database it should open. `sdk-host.ts`'s
 * `db.getClient()` falls back to this context when the header-derived plugin
 * id is null, so an isolated-database plugin's own export/import resolver
 * still reaches its own database instead of silently falling back to the
 * platform database.
 *
 * Stored on `globalThis` under a `Symbol.for` key for the same cross-bundle
 * reason as the portability registry and the SDK host.
 */
const KEY = Symbol.for('@sovereignfs/runtime:portability-plugin-context');

interface Holder {
  [KEY]?: AsyncLocalStorage<string>;
}

function storage(): AsyncLocalStorage<string> {
  const holder = globalThis as unknown as Holder;
  return (holder[KEY] ??= new AsyncLocalStorage<string>());
}

/** Runs `fn` with `pluginId` as the current portability plugin context. */
export function runWithPortabilityPlugin<T>(pluginId: string, fn: () => Promise<T>): Promise<T> {
  return storage().run(pluginId, fn);
}

/** The plugin id set by the nearest enclosing `runWithPortabilityPlugin`, if any. */
export function getPortabilityPluginContext(): string | undefined {
  return storage().getStore();
}
