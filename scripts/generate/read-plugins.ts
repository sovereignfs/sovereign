import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  checkCompatibility,
  findApiProvider,
  validateManifest,
  type SovereignManifest,
} from '@sovereignfs/manifest';
import { resolveComposeTargets } from './compose-routes';
import { EXAMPLE_PLUGINS_DIR, PLUGINS_DIR, ROOT, readPlatformVersion } from './paths';
import type { PluginEntry } from './types';

/**
 * Whether `SOVEREIGN_EXAMPLES_ENABLED` opts this build into scanning and
 * composing `example-plugins/` alongside `plugins/`. Off by default.
 *
 * Mirrors the exact truthy-string parsing in
 * `runtime/src/plugin-status.ts`'s `examplesEnabledByDefault()` — duplicated
 * rather than imported, since this script must run standalone (e.g. as the
 * first step of a Docker build stage, before the runtime package's own
 * dependency graph — `@sovereignfs/db`, etc. — is available or even built).
 * That function gates *visibility* of whatever this step already composed;
 * this one gates whether it gets composed at all. See
 * `scripts/generate-registry.ts`'s module doc comment for the two-layer model.
 */
export function examplesEnabledForBuild(): boolean {
  const v = process.env.SOVEREIGN_EXAMPLES_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function sortPluginEntries(plugins: PluginEntry[]): PluginEntry[] {
  return [...plugins].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

export function duplicateApiProviders(plugins: PluginEntry[]): SovereignManifest[] {
  return findApiProvider(plugins.map((p) => p.manifest)).duplicates;
}

/**
 * Two directories under `plugins/` whose manifests declare the same `id` —
 * e.g. a real clone at `plugins/<id>` alongside a personal `.local` dev
 * override of the same plugin (`install-plugins.ts` now skips cloning when a
 * `.local` directory already exists, specifically to prevent this, but this
 * check exists as a second line of defense so any other cause fails loudly at
 * generate time instead of silently producing a duplicate registry entry
 * (broken React key downstream in the nav rail, unpredictable route/env-var
 * resolution since both entries compose to the same routePrefix).
 */
export function duplicatePluginIds(plugins: PluginEntry[]): Map<string, string[]> {
  const dirsById = new Map<string, string[]>();
  for (const { dir, manifest } of plugins) {
    const dirs = dirsById.get(manifest.id) ?? [];
    dirs.push(dir);
    dirsById.set(manifest.id, dirs);
  }
  const duplicates = new Map<string, string[]>();
  for (const [id, dirs] of dirsById) {
    if (dirs.length > 1) duplicates.set(id, dirs);
  }
  return duplicates;
}

/**
 * Two different plugin ids whose manifests resolve to the same composed
 * destination path — `resolveComposeTargets` computes a plugin's destination
 * purely from `manifest.routePrefix` (plus `shell`), so two independently
 * authored plugins with colliding prefixes both write to the identical
 * directory. In production that's silent last-write-wins (`composePlugins`
 * iterates alphabetically; whichever id sorts last overwrites the other's
 * symlink with no error); in dev, `syncDir` can interleave both plugins'
 * files into one corrupted route tree across successive `--watch` runs.
 * Checks every target a manifest resolves to, not just the first, so an
 * `overlay` plugin's two composed destinations (the full-page fallback and
 * the `@modal` interception copy) are each an independent collision surface.
 * Manifests that already failed `resolveComposeTargets` for their own reason
 * (e.g. `overlay` with a multi-segment `routePrefix`) are skipped — that
 * error is reported elsewhere, at `composeTargets()`'s own call site.
 */
export function duplicateRoutePrefixes(plugins: PluginEntry[]): Map<string, string[]> {
  const idsByTarget = new Map<string, string[]>();
  for (const { manifest } of plugins) {
    const result = resolveComposeTargets(manifest);
    if (!result.ok) continue;
    for (const target of result.targets) {
      const ids = idsByTarget.get(target) ?? [];
      ids.push(manifest.id);
      idsByTarget.set(target, ids);
    }
  }
  const duplicates = new Map<string, string[]>();
  for (const [target, ids] of idsByTarget) {
    if (ids.length > 1) duplicates.set(target, ids);
  }
  return duplicates;
}

/**
 * Scan one directory of `<dir>/manifest.json` plugin sources. `baseDir` is
 * stamped onto each entry when it differs from `PLUGINS_DIR` so downstream
 * composition steps (which otherwise assume `PLUGINS_DIR`) resolve the
 * correct source path regardless of which directory a plugin came from.
 */
function readPluginsFrom(dir: string): PluginEntry[] {
  if (!existsSync(dir)) return [];
  const plugins: PluginEntry[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(dir, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;

    let json: unknown;
    try {
      json = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      console.error(
        `[generate] ${relative(ROOT, manifestPath)} is not valid JSON: ${(error as Error).message}`,
      );
      process.exit(1);
    }

    const result = validateManifest(json);
    if (!result.valid) {
      console.error(`[generate] invalid manifest ${relative(ROOT, manifestPath)}:`);
      for (const message of result.errors) console.error(`  - ${message}`);
      process.exit(1);
    }

    const compat = checkCompatibility(result.manifest, readPlatformVersion());
    if (!compat.compatible) {
      console.error(
        `[generate] incompatible plugin ${result.manifest.id} (${relative(ROOT, manifestPath)}):`,
      );
      console.error(`  ${compat.reason}`);
      process.exit(1);
    }
    for (const w of compat.warnings) console.warn(`[generate] warning: ${w}`);

    plugins.push({
      dir: entry.name,
      manifest: result.manifest,
      ...(dir === PLUGINS_DIR ? {} : { baseDir: dir }),
    });
  }

  return plugins;
}

export function readPlugins(): PluginEntry[] {
  const plugins = readPluginsFrom(PLUGINS_DIR);
  if (examplesEnabledForBuild()) {
    plugins.push(...readPluginsFrom(EXAMPLE_PLUGINS_DIR));
  }

  const sortedPlugins = sortPluginEntries(plugins);

  // Two directories declaring the same manifest id — most commonly a real
  // clone at plugins/<id> alongside a plugins/<id>.local dev override, or (now
  // that example-plugins/ can also be composed) an example manually copied
  // into plugins/<id> as well. Fail loudly rather than composing both to the
  // same routePrefix and letting the nav rail render a broken duplicate React
  // key at request time.
  const idDuplicates = duplicatePluginIds(sortedPlugins);
  if (idDuplicates.size > 0) {
    console.error('[generate] more than one plugin directory declares the same manifest id:');
    for (const [id, dirs] of idDuplicates) {
      console.error(`  - "${id}": ${dirs.join(', ')}`);
    }
    console.error(
      '  Remove one of the directories (a plugins/<id>.local dev override should ' +
        'make install-plugins.ts skip cloning the real plugins/<id> — see its ' +
        '"already installed" check; a plugins/<id> that duplicates an ' +
        'example-plugins/<id> should be removed in favor of the example, or the ' +
        'example left disabled via SOVEREIGN_EXAMPLES_ENABLED).',
    );
    process.exit(1);
  }

  // Two different plugin ids resolving to the same composed destination —
  // silent last-write-wins in production, a corrupted interleaved route
  // tree in dev. Fail loudly rather than composing either.
  const routePrefixDuplicates = duplicateRoutePrefixes(sortedPlugins);
  if (routePrefixDuplicates.size > 0) {
    console.error(
      '[generate] more than one plugin resolves to the same composed route destination:',
    );
    for (const [target, ids] of routePrefixDuplicates) {
      console.error(`  - "${target}": ${ids.join(', ')}`);
    }
    console.error('  Give each plugin a unique routePrefix (or shell mode) in its manifest.');
    process.exit(1);
  }

  // PLT-16: at most one plugin may serve the public /api/* namespace. Fail
  // loudly rather than picking one non-deterministically at request time.
  const duplicates = duplicateApiProviders(sortedPlugins);
  if (duplicates.length > 1) {
    console.error(
      '[generate] more than one plugin declares apiProvider: true — exactly one ' +
        'API provider is allowed per instance (PLT-16):',
    );
    for (const m of duplicates) console.error(`  - ${m.id}`);
    process.exit(1);
  }

  return sortedPlugins;
}
