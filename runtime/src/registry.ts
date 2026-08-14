import type { SovereignManifest } from '@sovereignfs/manifest';
import { registry } from '../generated/registry';

/**
 * Mirrors `@sovereignfs/db`'s `DEFAULT_ROOT_PLUGIN_ID` as a literal (same
 * convention `runtime/app/(platform)/layout.tsx` already uses for the
 * sidebar's Launcher icon) rather than importing it: `@sovereignfs/db`'s
 * `platform-db.ts` pulls in `client.ts` at module scope (`better-sqlite3`,
 * `pg`), and this file is `importScripts`-ed into the service worker via
 * `runtime/worker/offline-session.ts` — bundling that Node-only graph into a
 * browser SW context is exactly the class of silent breakage documented in
 * `next.config.ts`'s comment above `runtimeCaching` (a prior version of that
 * file broke the same way for an unrelated reason).
 */
const DEFAULT_ROOT_PLUGIN_ID = 'fs.sovereign.launcher';

/** All installed plugins, from the generated registry (built by `pnpm generate`). */
export function getInstalledPlugins(): SovereignManifest[] {
  return registry;
}

/**
 * IDs of the bundled example plugins (manifest `example: true`). The source of
 * truth for the bulk enable/disable control — resolved from the registry so a
 * caller can never target a non-example plugin through it.
 */
export function getExamplePluginIds(plugins: SovereignManifest[] = registry): string[] {
  return plugins.filter((manifest) => manifest.example === true).map((manifest) => manifest.id);
}

/**
 * IDs of plugins flagged `development: true`. The source of truth for
 * `SOVEREIGN_HIDE_DEVELOPMENT_PLUGINS` (`./plugin-status.ts`) — resolved from
 * the registry so a caller can never target a non-flagged plugin through it.
 */
export function getDevelopmentPluginIds(plugins: SovereignManifest[] = registry): string[] {
  return plugins.filter((manifest) => manifest.development === true).map((manifest) => manifest.id);
}

/**
 * IDs of plugins flagged `disabled: true`. The source of truth for the
 * unconditional, author-declared hard-disable gate in `./plugin-status.ts` —
 * resolved from the registry so a caller can never target a non-flagged
 * plugin through it.
 */
export function getHardDisabledPluginIds(plugins: SovereignManifest[] = registry): string[] {
  return plugins.filter((manifest) => manifest.disabled === true).map((manifest) => manifest.id);
}

/**
 * Full, absolute path prefixes for every manifest-declared offline-capable
 * plugin (research 0012) — bare `<routePrefix>` for any plugin declaring
 * either offline tier (`'offline-first'` or `'device-only'`), its one
 * offline-capable entry point. Both tiers get the same precaching treatment
 * here; they differ in storage and encryption, not in how the shell document
 * itself is cached. Consumed by `next.config.ts` to scope the service
 * worker's neutral-shell cache to just these routes, and by `middleware.ts`
 * to mark matching requests `x-sovereign-offline-route` for the neutral-shell
 * SSR discipline `runtime/app/(platform)/layout.tsx` enforces; every other
 * route falls to `NetworkOnly` and the generic `/offline` page.
 *
 * `/` is included whenever Launcher (`DEFAULT_ROOT_PLUGIN_ID`) is itself
 * offline-first, since `middleware.ts` rewrites `/` to the resolved root
 * plugin's route in place (SRS PLT-14) — in the default configuration that
 * is Launcher, so `/` and `/launcher` render the identical, already-neutral
 * document. **Known limitation:** an instance whose admin has configured a
 * *different*, non-offline-first plugin as the root does not get this
 * treatment for `/` — it falls back to the generic `/offline` page like any
 * other non-offline route, rather than the (unverified-for-that-plugin)
 * neutral-shell cache. That is a deliberate, safe default: this function has
 * no way to know the runtime `root_plugin_id` DB setting at build time, and
 * assuming an arbitrary custom root is neutral-shell-safe without the same
 * `offline-route-neutrality.test.ts` guarantee Launcher has would risk
 * exactly the unpartitioned-replay bug this was written to close (see
 * `runtime/next.config.ts`'s comment above `runtimeCaching`).
 */
export function getOfflineRoutePrefixes(plugins: SovereignManifest[] = registry): string[] {
  const prefixes = plugins
    .filter((manifest) => manifest.offline !== undefined)
    .map((manifest) => manifest.routePrefix);
  const launcherIsOfflineFirst = plugins.some(
    (manifest) => manifest.id === DEFAULT_ROOT_PLUGIN_ID && manifest.offline !== undefined,
  );
  return launcherIsOfflineFirst ? ['/', ...prefixes] : prefixes;
}

/** A `shell: default` plugin's resolved mobile chrome visibility (RFC 0075). */
export interface MobileChromeOverride {
  routePrefix: string;
  mobileHeader: boolean;
  mobileFooter: boolean;
}

/**
 * Mobile header/footer visibility overrides (`shellConfig.mobileHeader` /
 * `shellConfig.mobileFooter`, RFC 0075) for every plugin that deviates from
 * the default (both `true`). Only deviating plugins are included so callers
 * can treat "not present" as "show both" without a lookup miss vs. an
 * explicit `true` needing to be distinguished.
 */
export function getMobileChromeConfig(
  plugins: SovereignManifest[] = registry,
): MobileChromeOverride[] {
  return plugins
    .filter(
      (manifest) =>
        manifest.shellConfig?.mobileHeader === false ||
        manifest.shellConfig?.mobileFooter === false,
    )
    .map((manifest) => ({
      routePrefix: manifest.routePrefix,
      mobileHeader: manifest.shellConfig?.mobileHeader ?? true,
      mobileFooter: manifest.shellConfig?.mobileFooter ?? true,
    }));
}
