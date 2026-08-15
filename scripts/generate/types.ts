import type { SovereignManifest } from '@sovereignfs/manifest';

export interface PluginEntry {
  dir: string;
  manifest: SovereignManifest;
  /**
   * Absolute path to the directory containing `dir`. Defaults to `PLUGINS_DIR`
   * when omitted — set explicitly for plugins discovered from a source other
   * than `plugins/` (currently only `example-plugins/`).
   */
  baseDir?: string;
}
