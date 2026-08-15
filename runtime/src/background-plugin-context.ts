import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Tracks which plugin's schedule/job handler is currently running, for
 * `scheduler.ts` (RFC 0046 Phase 1) and `jobs.ts` (RFC 0046). Both invoke a
 * plugin's handler directly from an in-process timer/worker loop — there is
 * no real Next.js request, so `x-sovereign-plugin-id` is never set on
 * anything `next/headers()` can see, and `sdk.db.getClient()` (which reads
 * that header) can't tell which plugin's database it should open.
 * `sdk-host.ts`'s `db.getClient()` falls back to this context when the
 * header-derived plugin id is null, so a schedule/job handler still reaches
 * its own isolated database instead of silently falling back to the
 * platform database — the same problem, and the same fix, as
 * `portability/plugin-context.ts` already solves for export/import
 * resolvers. Deliberately a separate `AsyncLocalStorage` instance rather
 * than reusing that one: different call sites, different lifecycle, and
 * conflating them would make either one harder to reason about for a
 * marginal DRY win.
 *
 * Stored on `globalThis` under a `Symbol.for` key for the same cross-bundle
 * reason as the portability registry and the SDK host.
 */
const KEY = Symbol.for('@sovereignfs/runtime:background-plugin-context');

interface Holder {
  [KEY]?: AsyncLocalStorage<string>;
}

function storage(): AsyncLocalStorage<string> {
  const holder = globalThis as unknown as Holder;
  return (holder[KEY] ??= new AsyncLocalStorage<string>());
}

/** Runs `fn` with `pluginId` as the current background-invocation plugin context. */
export function runWithBackgroundPlugin<T>(pluginId: string, fn: () => Promise<T>): Promise<T> {
  return storage().run(pluginId, fn);
}

/** The plugin id set by the nearest enclosing `runWithBackgroundPlugin`, if any. */
export function getBackgroundPluginContext(): string | undefined {
  return storage().getStore();
}
