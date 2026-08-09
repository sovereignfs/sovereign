import type { SovereignManifest } from '@sovereignfs/manifest';
import { registry } from '../generated/registry';

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
 * Full, absolute path prefixes for every manifest-declared offline-capable
 * plugin (research 0012) — bare `<routePrefix>` for any plugin declaring
 * either offline tier (`'offline-first'` or `'device-only'`), its one
 * offline-capable entry point. Both tiers get the same precaching treatment
 * here; they differ in storage and encryption, not in how the shell document
 * itself is cached. Consumed at build time by `next.config.ts` to scope the
 * service worker's precache to just these routes; every other route stays
 * `NetworkFirst` and falls back to `/offline` as usual.
 */
export function getOfflineRoutePrefixes(plugins: SovereignManifest[] = registry): string[] {
  return plugins
    .filter((manifest) => manifest.offline !== undefined)
    .map((manifest) => manifest.routePrefix);
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
