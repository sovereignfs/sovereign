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
 * route (RFC 0072) — `<routePrefix><offline.routes[].prefix>` for each
 * plugin. Consumed at build time by `next.config.ts` to scope the service
 * worker's precache to just these routes; every other route stays
 * `NetworkFirst` and falls back to `/offline` as usual.
 */
export function getOfflineRoutePrefixes(plugins: SovereignManifest[] = registry): string[] {
  return plugins.flatMap(
    (manifest) =>
      manifest.offline?.routes.map((route) => `${manifest.routePrefix}${route.prefix}`) ?? [],
  );
}
