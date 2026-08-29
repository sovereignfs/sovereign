import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Tracks which plugin's export/import/resolver is currently running (plus
 * the user it's scoped to), for the portability assembler/restorer
 * (`assemble.ts` / `restore.ts`). Those call a plugin's exporter/importer
 * directly from `/api/account/export` and `/api/account/import`, which are
 * platform routes — `x-sovereign-plugin-id` is never set on that request, so
 * `sdk.db.getClient()` (which reads that header) can't tell which plugin's
 * database it should open. `sdk-host.ts`'s `db.getClient()` falls back to
 * this context when the header-derived plugin id is null, so an
 * isolated-database plugin's own export/import resolver still reaches its
 * own database instead of silently falling back to the platform database.
 *
 * `userId` closes the same gap for `sdk.storage`: a plugin's export resolver
 * reading back a user-owned object (e.g. Travellog's visit photos,
 * `ownerUserId` set at upload) via `sdk.storage.get()` was resolving
 * `context.userId` to `null` (no request, so `storageContext()` never sees
 * `x-sovereign-user-id`), and `canAccessStorageObject` denies whenever
 * `ownerUserId` is set and the reading context's `userId` doesn't match —
 * including `null` — so the read silently returned `null` instead of the
 * object, with no error surfaced. `ExportContext`/`ImportContext` are always
 * user-scoped, unlike a schedule/job's `JobContext` (plugin-scoped only,
 * `background-plugin-context.ts`'s own reason for never carrying a userId),
 * so this context can and should carry one.
 *
 * Stored on `globalThis` under a `Symbol.for` key for the same cross-bundle
 * reason as the portability registry and the SDK host.
 */
const KEY = Symbol.for('@sovereignfs/runtime:portability-plugin-context');

interface PortabilityContextValue {
  pluginId: string;
  /** The user being exported/imported/deleted — RFC 0007/0052 flows are always user-scoped. */
  userId: string | null;
}

interface Holder {
  [KEY]?: AsyncLocalStorage<PortabilityContextValue>;
}

function storage(): AsyncLocalStorage<PortabilityContextValue> {
  const holder = globalThis as unknown as Holder;
  return (holder[KEY] ??= new AsyncLocalStorage<PortabilityContextValue>());
}

/** Runs `fn` with `pluginId`/`userId` as the current portability plugin context. */
export function runWithPortabilityPlugin<T>(
  pluginId: string,
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  return storage().run({ pluginId, userId }, fn);
}

/** The plugin id set by the nearest enclosing `runWithPortabilityPlugin`, if any. */
export function getPortabilityPluginContext(): string | undefined {
  return storage().getStore()?.pluginId;
}

/** The user id set by the nearest enclosing `runWithPortabilityPlugin`, if any. */
export function getPortabilityUserContext(): string | null | undefined {
  return storage().getStore()?.userId;
}
