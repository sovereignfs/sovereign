import type { DrizzleClient, MailOptions, PlatformConfig } from './types';

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
}

let _host: SdkHost | null = null;

/**
 * Register the platform host implementation. Called once at runtime startup
 * (via `runtime/instrumentation.ts`) before any request is served.
 *
 * Exported from `@sovereignfs/sdk` so the runtime can call it; plugin code
 * should never need to call this.
 */
export function provideHost(host: SdkHost): void {
  _host = host;
}

/**
 * Return the registered host implementation, throwing if none is registered
 * (i.e. the SDK is being executed outside the Sovereign runtime).
 */
export function requireHost(): SdkHost {
  if (!_host) {
    throw new Error(
      '@sovereignfs/sdk: no runtime host is registered. ' +
        'SDK methods run inside the Sovereign runtime — start the platform with `pnpm dev` ' +
        'or `pnpm sv dev` and ensure the plugin is installed.',
    );
  }
  return _host;
}
