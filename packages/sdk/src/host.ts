import type { DataContractRef, DataContractResolver } from './data';
import type { ExportResolver, ImportHandler } from './portability';
import type { ActivityLogEntry, DrizzleClient, MailOptions, PlatformConfig } from './types';

/**
 * The host interface that the Sovereign runtime provides to the SDK.
 * Every method that touches platform infrastructure (DB, mailer, config) is
 * routed through this interface — the SDK itself has no runtime dependencies.
 */
export interface SdkHost {
  db: {
    getClient(): Promise<DrizzleClient>;
  };
  mailer: {
    send(options: MailOptions): Promise<void>;
  };
  platform: {
    getConfig(): Promise<PlatformConfig>;
  };
  data: {
    /** Register a resolver for a contract this plugin provides. */
    provide(contract: string, resolver: DataContractResolver): void;
    /**
     * Query a provider plugin's contract for the current user.
     * `consumerId` and `userId` are read from request headers by the SDK caller.
     */
    query(
      ref: DataContractRef,
      consumerId: string | null,
      userId: string | null,
      tenantId: string,
      params: unknown,
    ): Promise<unknown[]>;
  };
  activity: {
    /**
     * Record one activity event.
     * `actorId`, `pluginId`, and `tenantId` are injected by the runtime host
     * from request headers so plugins cannot forge actor identity.
     */
    log(entry: ActivityLogEntry, actorId: string | null, pluginId: string | null): Promise<void>;
  };
  portability: {
    /**
     * Register a plugin's export resolver, keyed by `pluginId` (resolved by the
     * SDK from the request context). The runtime invokes it at export time.
     */
    provideExport(pluginId: string, resolver: ExportResolver): void;
    /** Register a plugin's import handler, keyed by `pluginId`. */
    provideImport(pluginId: string, handler: ImportHandler): void;
  };
}

/**
 * The host is stored on `globalThis` under a `Symbol.for` key, NOT a plain
 * module-level variable. Next.js compiles instrumentation, route handlers, and
 * server actions into separate bundles, each of which can get its own instance
 * of this module — and dev HMR re-evaluates it on edits, resetting any
 * module-level state. With a per-module `let`, `provideHost()` (called once from
 * `runtime/instrumentation.ts`) would set the host on one instance while a
 * plugin server action reads `null` from another, throwing "no runtime host".
 * A `Symbol.for`-keyed global is shared across every module instance in the same
 * Node process, so the single registration is always visible.
 */
const HOST_KEY = Symbol.for('@sovereignfs/sdk:host');

interface HostHolder {
  [HOST_KEY]?: SdkHost | null;
}

function holder(): HostHolder {
  return globalThis as unknown as HostHolder;
}

/**
 * Register the platform host implementation. Called once at runtime startup
 * (via `runtime/instrumentation.ts`) before any request is served.
 *
 * Exported from `@sovereignfs/sdk` so the runtime can call it; plugin code
 * should never need to call this.
 */
export function provideHost(host: SdkHost): void {
  holder()[HOST_KEY] = host;
}

/**
 * Return the registered host implementation, throwing if none is registered
 * (i.e. the SDK is being executed outside the Sovereign runtime).
 */
export function requireHost(): SdkHost {
  const host = holder()[HOST_KEY];
  if (!host) {
    throw new Error(
      '@sovereignfs/sdk: no runtime host is registered. ' +
        'SDK methods run inside the Sovereign runtime — start the platform with `pnpm dev` ' +
        'or `pnpm sv dev` and ensure the plugin is installed.',
    );
  }
  return host;
}
