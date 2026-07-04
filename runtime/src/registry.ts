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
