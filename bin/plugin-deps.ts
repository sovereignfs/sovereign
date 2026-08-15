/**
 * Plugin external dependency resolution (RFC 0057).
 *
 * Plugin source is copied into the runtime's module graph
 * (`scripts/generate-registry.ts`), so a plugin's external npm dependencies
 * must be resolvable from the *runtime's* `node_modules` — pnpm's strict
 * per-package isolation means a dep declared only in `plugins/<id>/package.json`
 * is invisible to the runtime's compiler. This module keeps
 * `runtime/generated/plugin-deps.json` (a committed ledger of which plugin
 * contributed which external dep) and `runtime/package.json` in sync, so
 * plugin developers never edit `runtime/package.json` by hand.
 *
 * All functions here are pure with respect to the filesystem except the
 * `*ForPlugin`/`sync*` orchestrators, which are the only ones that read/write
 * disk or spawn `pnpm install` — kept thin and split out specifically so the
 * decision logic (what counts as an external dep, what survives a remove,
 * how a version conflict resolves) is unit-testable without a real
 * filesystem or network. Referenced by `bin/sv.ts` (`plugin add`/`plugin
 * remove`) and `scripts/dev.ts` (`.local` plugin sync).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import semver from 'semver';

/** `{ [pluginManifestId]: { [depName]: versionRange } }` — see RFC 0057 §1. */
export type PluginDepsLedger = Record<string, Record<string, string>>;

interface PackageJsonDeps {
  dependencies?: Record<string, string>;
}

export function readPluginDepsLedger(ledgerPath: string): PluginDepsLedger {
  if (!existsSync(ledgerPath)) return {};
  return JSON.parse(readFileSync(ledgerPath, 'utf8')) as PluginDepsLedger;
}

export function writePluginDepsLedger(ledgerPath: string, ledger: PluginDepsLedger): void {
  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
}

/** Reads a `package.json`'s `dependencies` map — `{}` if the file or field is absent. */
export function readDependencies(packageJsonPath: string): Record<string, string> {
  if (!existsSync(packageJsonPath)) return {};
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJsonDeps;
  return pkg.dependencies ?? {};
}

/**
 * A "platform peer" is any dep already in `runtime/package.json` that isn't
 * currently attributed to a plugin in the ledger — i.e. the platform's own
 * baseline (`next`, `react`, `better-auth`, …), computed dynamically rather
 * than a hardcoded list so it never drifts from what `runtime/package.json`
 * actually declares. A dep hand-added outside this mechanism is, by this
 * same rule, also treated as a platform peer — the safe direction, since it
 * just means the hoister leaves it alone rather than mistakenly prunes it.
 */
export function computePlatformPeerNames(
  runtimeDeps: Record<string, string>,
  ledger: PluginDepsLedger,
): Set<string> {
  const attributed = new Set<string>();
  for (const deps of Object.values(ledger)) {
    for (const name of Object.keys(deps)) attributed.add(name);
  }
  return new Set(Object.keys(runtimeDeps).filter((name) => !attributed.has(name)));
}

/**
 * Filters a plugin's `dependencies` down to genuine external deps: never
 * `@sovereignfs/*` (workspace packages, already resolved via pnpm
 * workspaces) and never an existing platform peer. `devDependencies` are
 * never considered — callers only ever pass `dependencies`.
 */
export function extractExternalDeps(
  pluginDeps: Record<string, string>,
  platformPeers: ReadonlySet<string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, range] of Object.entries(pluginDeps)) {
    if (name.startsWith('@sovereignfs/')) continue;
    if (platformPeers.has(name)) continue;
    result[name] = range;
  }
  return result;
}

export interface DepConflict {
  name: string;
  existing: string;
  incoming: string;
  /** The range that was kept in `runtime/package.json` after resolution. */
  kept: string;
}

export interface HoistResult {
  /** Deps newly added to `runtime/package.json` (no prior contributor). */
  added: string[];
  /** Deps already present with an identical range — no-op, not re-counted. */
  unchanged: string[];
  /** Deps present with a different range — resolved by keeping the newer (RFC 0057 §6). */
  conflicts: DepConflict[];
}

/**
 * Merges one plugin's external deps into `runtimeDeps` and the ledger (both
 * mutated in place — callers own persisting them). On a version conflict the
 * newer range wins (compared via `semver.minVersion`, RFC 0057 §6); if either
 * range can't be parsed as semver, the existing range is kept and the pair is
 * still reported as a conflict so the caller can warn.
 */
export function mergePluginDeps(
  pluginId: string,
  externalDeps: Record<string, string>,
  runtimeDeps: Record<string, string>,
  ledger: PluginDepsLedger,
): HoistResult {
  const added: string[] = [];
  const unchanged: string[] = [];
  const conflicts: DepConflict[] = [];

  for (const [name, incoming] of Object.entries(externalDeps)) {
    const existing = runtimeDeps[name];
    if (existing === undefined) {
      runtimeDeps[name] = incoming;
      added.push(name);
    } else if (existing === incoming) {
      unchanged.push(name);
    } else {
      const existingMin = semver.minVersion(existing);
      const incomingMin = semver.minVersion(incoming);
      const kept =
        existingMin && incomingMin && semver.gt(incomingMin, existingMin) ? incoming : existing;
      runtimeDeps[name] = kept;
      conflicts.push({ name, existing, incoming, kept });
    }
  }

  ledger[pluginId] = { ...externalDeps };
  // Sort so runtime/package.json's dependencies block stays diffable —
  // insertion order would otherwise put every newly-added dep at the end
  // regardless of alphabetical position.
  const sorted = Object.keys(runtimeDeps).sort();
  for (const name of sorted) {
    const value = runtimeDeps[name];
    Reflect.deleteProperty(runtimeDeps, name);
    if (value !== undefined) runtimeDeps[name] = value;
  }

  return { added, unchanged, conflicts };
}

export interface PruneResult {
  /** Deps removed from `runtime/package.json` — no remaining plugin needs them. */
  removed: string[];
  /** Deps the departing plugin used that are still needed by another plugin. */
  kept: string[];
}

/**
 * Removes `pluginId`'s ledger entry and prunes from `runtimeDeps` any dep it
 * contributed that no *other* remaining plugin still references (RFC 0057
 * §4). Both `runtimeDeps` and `ledger` are mutated in place.
 */
export function prunePluginDeps(
  pluginId: string,
  runtimeDeps: Record<string, string>,
  ledger: PluginDepsLedger,
): PruneResult {
  const departing = ledger[pluginId] ?? {};
  Reflect.deleteProperty(ledger, pluginId);

  const stillNeeded = new Set<string>();
  for (const deps of Object.values(ledger)) {
    for (const name of Object.keys(deps)) stillNeeded.add(name);
  }

  const removed: string[] = [];
  const kept: string[] = [];
  for (const name of Object.keys(departing)) {
    if (stillNeeded.has(name)) {
      kept.push(name);
    } else {
      Reflect.deleteProperty(runtimeDeps, name);
      removed.push(name);
    }
  }

  return { removed, kept };
}

interface DepHoistPaths {
  runtimePkgPath: string;
  ledgerPath: string;
}

function readRuntimePackageJson(runtimePkgPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(runtimePkgPath, 'utf8')) as Record<string, unknown>;
}

function writeRuntimePackageJson(runtimePkgPath: string, pkg: Record<string, unknown>): void {
  writeFileSync(runtimePkgPath, JSON.stringify(pkg, null, 2) + '\n');
  // Match the repo-wide Prettier formatting exactly rather than hand-tuning
  // JSON.stringify's output to agree with it — see CLAUDE.md's "Never add
  // per-package Prettier overrides" and the `pnpm format:check` CI gate this
  // must satisfy either way.
  spawnSync('pnpm', ['exec', 'prettier', '--write', runtimePkgPath], { stdio: 'ignore' });
}

function runInstall(root: string): boolean {
  const result = spawnSync('pnpm', ['install', '--filter', 'runtime'], {
    cwd: root,
    stdio: 'inherit',
  });
  return result.status === 0;
}

export interface HoistForPluginOptions extends DepHoistPaths {
  pluginId: string;
  pluginPkgPath: string;
  root: string;
  /** Set false to skip `pnpm install` (e.g. tests, dry runs). Defaults to true. */
  install?: boolean;
}

/**
 * `sv plugin add`'s dependency step: read the plugin's `package.json`,
 * extract external deps, and — if there are any — hoist them into
 * `runtime/package.json` and the ledger, then `pnpm install --filter
 * runtime`. No-ops (returns `null`) when the plugin declares no external
 * deps, so a plugin with none never touches `runtime/package.json`.
 */
export function hoistDepsForPlugin(opts: HoistForPluginOptions): HoistResult | null {
  const { pluginId, pluginPkgPath, runtimePkgPath, ledgerPath, root, install = true } = opts;

  const pluginDeps = readDependencies(pluginPkgPath);
  const ledger = readPluginDepsLedger(ledgerPath);
  const runtimePkg = readRuntimePackageJson(runtimePkgPath);
  const runtimeDeps = (runtimePkg.dependencies ?? {}) as Record<string, string>;

  const platformPeers = computePlatformPeerNames(runtimeDeps, ledger);
  const externalDeps = extractExternalDeps(pluginDeps, platformPeers);
  if (Object.keys(externalDeps).length === 0) return null;

  const result = mergePluginDeps(pluginId, externalDeps, runtimeDeps, ledger);
  runtimePkg.dependencies = runtimeDeps;

  writeRuntimePackageJson(runtimePkgPath, runtimePkg);
  writePluginDepsLedger(ledgerPath, ledger);
  if (install) runInstall(root);

  return result;
}

export interface PruneForPluginOptions extends DepHoistPaths {
  pluginId: string;
  root: string;
  install?: boolean;
}

/**
 * `sv plugin remove`'s dependency step: prune the departing plugin's
 * no-longer-needed deps from `runtime/package.json` and the ledger, then
 * `pnpm install --filter runtime`. No-ops (returns `null`) when the plugin
 * has no ledger entry (it declared no external deps, or was installed before
 * this mechanism existed).
 */
export function pruneDepsForPlugin(opts: PruneForPluginOptions): PruneResult | null {
  const { pluginId, runtimePkgPath, ledgerPath, root, install = true } = opts;

  const ledger = readPluginDepsLedger(ledgerPath);
  if (!(pluginId in ledger)) return null;

  const runtimePkg = readRuntimePackageJson(runtimePkgPath);
  const runtimeDeps = (runtimePkg.dependencies ?? {}) as Record<string, string>;

  const result = prunePluginDeps(pluginId, runtimeDeps, ledger);
  runtimePkg.dependencies = runtimeDeps;

  writeRuntimePackageJson(runtimePkgPath, runtimePkg);
  writePluginDepsLedger(ledgerPath, ledger);
  if (result.removed.length > 0 && install) runInstall(root);

  return result;
}

export interface LocalPluginSyncOptions extends DepHoistPaths {
  pluginsDir: string;
  root: string;
  install?: boolean;
}

export interface LocalPluginSyncResult {
  changed: boolean;
  /** One line per plugin whose contribution changed, for a dev-startup notice. */
  summary: string[];
}

/**
 * `pnpm dev`'s self-heal step for `.local` plugins (RFC 0057 §5) — these
 * bypass `sv plugin add`/`remove` entirely (a developer just clones or edits
 * a directory), so nothing else keeps the ledger in sync for them. Scans
 * `plugins/*.local/package.json`, recomputes each one's external deps, and
 * compares the result against the ledger; if anything differs (new dep,
 * removed dep, version bump) it updates `runtime/package.json` and the
 * ledger and runs `pnpm install --filter runtime` once for the whole batch.
 * The comparison itself is cheap (a handful of small JSON reads) and runs
 * every `pnpm dev` boot; only a real diff triggers the expensive install.
 */
export function syncLocalPluginDeps(opts: LocalPluginSyncOptions): LocalPluginSyncResult {
  const { pluginsDir, runtimePkgPath, ledgerPath, root, install = true } = opts;

  const localDirs = existsSync(pluginsDir)
    ? readdirSync(pluginsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.endsWith('.local'))
        .map((entry) => entry.name)
    : [];

  const ledger = readPluginDepsLedger(ledgerPath);
  const runtimePkg = readRuntimePackageJson(runtimePkgPath);
  const runtimeDeps = (runtimePkg.dependencies ?? {}) as Record<string, string>;

  const summary: string[] = [];
  let changed = false;

  for (const dir of localDirs) {
    const pluginPkgPath = join(pluginsDir, dir, 'package.json');
    if (!existsSync(pluginPkgPath)) continue;

    let pluginId: string;
    try {
      const manifest = JSON.parse(readFileSync(join(pluginsDir, dir, 'manifest.json'), 'utf8')) as {
        id?: string;
      };
      if (!manifest.id) continue;
      pluginId = manifest.id;
    } catch {
      continue;
    }

    const pluginDeps = readDependencies(pluginPkgPath);
    const platformPeers = computePlatformPeerNames(runtimeDeps, ledger);
    const externalDeps = extractExternalDeps(pluginDeps, platformPeers);
    const previous = ledger[pluginId];

    const sameAsLedger =
      previous !== undefined &&
      Object.keys(externalDeps).length === Object.keys(previous).length &&
      Object.entries(externalDeps).every(([name, range]) => previous[name] === range);
    if (sameAsLedger) continue;

    if (Object.keys(externalDeps).length === 0) {
      if (previous === undefined) continue;
      const result = prunePluginDeps(pluginId, runtimeDeps, ledger);
      if (result.removed.length > 0 || result.kept.length > 0) {
        changed = true;
        summary.push(`${pluginId}: removed ${result.removed.length} runtime dep(s)`);
      }
      continue;
    }

    const result = mergePluginDeps(pluginId, externalDeps, runtimeDeps, ledger);
    if (result.added.length > 0 || result.conflicts.length > 0) {
      changed = true;
      summary.push(
        `${pluginId}: ${result.added.length} added, ${result.conflicts.length} version-updated`,
      );
    }
  }

  if (changed) {
    runtimePkg.dependencies = runtimeDeps;
    writeRuntimePackageJson(runtimePkgPath, runtimePkg);
    writePluginDepsLedger(ledgerPath, ledger);
    if (install) runInstall(root);
  }

  return { changed, summary };
}
