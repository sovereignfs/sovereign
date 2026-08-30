import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { SovereignManifest } from '@sovereignfs/manifest';
import {
  MINIMAL_DIR,
  MINIMAL_DIR_KEEP,
  MODAL_DIR,
  PLATFORM_PLUGINS_DIR,
  PLUGINS_DIR,
  PLUGINS_DIR_KEEP,
} from './paths';
import type { PluginEntry } from './types';

export interface ComposeTargetDirs {
  platformPluginsDir: string;
  modalDir: string;
  minimalDir: string;
}

export interface ComposeTargetResult {
  ok: boolean;
  targets: string[];
  error?: string;
}

/**
 * The destination directories a plugin's `app/` tree composes into, chosen by
 * its `shell` mode (RFC 0001, RFC 0014):
 *   - `default` (or omitted) → the `(plugins)` group (full page under the shell).
 *   - `overlay` → BOTH the `(plugins)` group (full-page fallback for hard loads)
 *     AND the `@modal/(modal)/(.)<segment>` interception copy (soft-nav dialog).
 *   - `minimal` → the `(minimal)` group (chrome-free, full-bleed). Multi-segment
 *     routePrefix is allowed (unlike overlay, which must be single-segment).
 * Returns a clear error for invalid shell/route combinations.
 */
export function resolveComposeTargets(
  manifest: SovereignManifest,
  dirs: ComposeTargetDirs = {
    platformPluginsDir: PLATFORM_PLUGINS_DIR,
    modalDir: MODAL_DIR,
    minimalDir: MINIMAL_DIR,
  },
): ComposeTargetResult {
  const shell = manifest.shell ?? 'default';
  const routeSegment = manifest.routePrefix.replace(/^\/+/, '');
  const fallback = join(dirs.platformPluginsDir, routeSegment);

  if (shell === 'minimal') {
    return { ok: true, targets: [join(dirs.minimalDir, routeSegment)] };
  }

  if (shell === 'overlay') {
    // The (.) interception convention matches a same-level URL segment, so an
    // overlay plugin's routePrefix must be a single segment in v1.
    if (routeSegment.includes('/')) {
      return {
        ok: false,
        targets: [],
        error:
          `[generate] plugin ${manifest.id} declares shell: "overlay" with a multi-segment ` +
          `routePrefix "${manifest.routePrefix}". Overlay plugins must use a single-segment ` +
          'routePrefix (e.g. /console) so the interception route resolves correctly.',
      };
    }
    return { ok: true, targets: [fallback, join(dirs.modalDir, `(.)${routeSegment}`)] };
  }

  return { ok: true, targets: [fallback] };
}

/**
 * The destination directories a plugin's `app/` tree composes into. Exits the
 * process with a clear error for invalid combinations in the CLI path.
 */
function composeTargets(manifest: SovereignManifest): string[] {
  const result = resolveComposeTargets(manifest);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  return result.targets;
}

/**
 * Incrementally sync `src` directory into `dest`, touching only files that
 * have actually changed (size or mtime differs) and removing files in `dest`
 * that no longer exist in `src`. Unchanged files are left untouched so
 * Next.js's dev watcher doesn't see filesystem events and doesn't invalidate
 * already-compiled routes — preventing the client-side "404 on soft nav"
 * that happens when a spurious fs.watch event re-copies everything and
 * Next.js forgets its compiled route map mid-navigation.
 */
function syncDir(src: string, dest: string): void {
  // Guard against a stale symlink left at `dest` from a prior production
  // compose (e.g. a local `NODE_ENV=production pnpm generate` run) — mkdirSync
  // treats an existing symlink-to-directory as already-there and no-ops,
  // which would silently keep syncing into the *symlink target* instead of a
  // real per-dev directory.
  try {
    if (lstatSync(dest).isSymbolicLink()) rmSync(dest, { recursive: true, force: true });
  } catch {
    // dest doesn't exist yet — nothing to clean up.
  }
  mkdirSync(dest, { recursive: true });

  const srcNames = new Set(readdirSync(src));

  // Remove entries in dest that are gone from src.
  for (const name of readdirSync(dest)) {
    if (!srcNames.has(name)) rmSync(join(dest, name), { recursive: true, force: true });
  }

  for (const name of srcNames) {
    const srcPath = join(src, name);
    const destPath = join(dest, name);
    const srcStat = statSync(srcPath);

    if (srcStat.isDirectory()) {
      syncDir(srcPath, destPath);
    } else {
      // Only write if the file is missing, has a different size, or the source
      // is newer than the destination (indicates the developer saved an edit).
      let needsCopy = !existsSync(destPath);
      if (!needsCopy) {
        const destStat = statSync(destPath);
        needsCopy = srcStat.size !== destStat.size || srcStat.mtimeMs > destStat.mtimeMs;
      }
      if (needsCopy) cpSync(srcPath, destPath);
    }
  }
}

/**
 * Compose one plugin's `app/` into `dest` — symlink in production, incremental
 * copy in dev. Production only runs this once before a single `next build`
 * (no live server to disrupt), so a fresh symlink each run is simplest and
 * correct; dev's `syncDir` must instead avoid touching unchanged files (see
 * its own doc comment) to keep the dev route watcher and HMR stable.
 *
 * `isProd` is an explicit parameter (rather than reading a module-level flag
 * directly) so this is a pure, independently-testable unit.
 */
export function linkOrCopyTarget(srcApp: string, dest: string, isProd: boolean): void {
  if (isProd) {
    rmSync(dest, { recursive: true, force: true });
    symlinkSync(srcApp, dest, 'dir');
    return;
  }
  syncDir(srcApp, dest);
}

/** Normalizes a path relative to `base` to forward slashes, for use as a Set key. */
function relSlash(base: string, target: string): string {
  return relative(base, target).split(sep).join('/');
}

/**
 * Recursively prunes stale composed route entries under `dir`. `activeEntries`
 * holds full relative paths (forward-slash normalized, e.g. `"kiosk/display"`)
 * rather than first-path-segments, so a multi-segment `routePrefix` plugin
 * that gets renamed or uninstalled has its stale nested leaf actually removed
 * instead of surviving because a sibling route still occupies the shared
 * parent segment (e.g. `kiosk`).
 *
 * `keep`/`onlyPrefix` apply only at the top level (`dir` itself), matching
 * the pre-recursive behavior — a hand-written file like `layout.tsx` or the
 * `@modal` directory is never touched regardless of depth.
 */
export function pruneGeneratedEntries(
  dir: string,
  activeEntries: Set<string>,
  options: { keep?: Set<string>; onlyPrefix?: string } = {},
): void {
  pruneGeneratedEntriesAt(dir, dir, activeEntries, options, true);
}

function pruneGeneratedEntriesAt(
  base: string,
  dir: string,
  activeEntries: Set<string>,
  options: { keep?: Set<string>; onlyPrefix?: string },
  isRoot: boolean,
): void {
  const keep = options.keep ?? new Set<string>();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (isRoot) {
      if (keep.has(name)) continue;
      if (options.onlyPrefix !== undefined && !name.startsWith(options.onlyPrefix)) continue;
    }

    const full = join(dir, name);
    const rel = relSlash(base, full);
    if (activeEntries.has(rel)) continue; // an active leaf, already synced elsewhere -- never descend into it

    const isAncestorOfActive = [...activeEntries].some((active) => active.startsWith(`${rel}/`));
    if (isAncestorOfActive) {
      // An intermediate route-prefix segment (e.g. "kiosk" while "kiosk/display"
      // is still active) — a real directory, never a symlink (only leaves are
      // symlinked in production). Recurse to prune stale descendants, then
      // remove the segment itself if that leaves it empty.
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      pruneGeneratedEntriesAt(base, full, activeEntries, options, false);
      try {
        if (readdirSync(full).length === 0) rmSync(full, { recursive: true, force: true });
      } catch {
        // Already gone or inaccessible -- nothing left to do.
      }
      continue;
    }

    // Neither active nor an ancestor of an active entry — stale, remove outright.
    rmSync(full, { recursive: true, force: true });
  }
}

function hasRouteFile(dir: string): boolean {
  return existsSync(join(dir, 'page.tsx')) || existsSync(join(dir, 'layout.tsx'));
}

/**
 * Walks `dir` to find every composed plugin route leaf. An exact match
 * against `activeEntries` is a leaf by definition — recorded and never
 * descended into, the same rule `pruneGeneratedEntriesAt` uses, and for the
 * same reason: a plugin's own internal routing structure (e.g. a Next.js
 * route group like `(home)`, which adds a physical directory level but no
 * URL segment) lives inside its composed leaf and must never be mistaken
 * for a nested route-prefix segment just because it also happens to contain
 * a `page.tsx`/`layout.tsx`. Anything else with a `page.tsx`/`layout.tsx`
 * directly inside it is a genuinely orphaned leaf (no manifest claims it);
 * anything that is neither is an intermediate route-prefix segment (real or
 * stale) and gets recursed into to find leaves further down.
 */
function collectComposedLeaves(
  base: string,
  dir: string,
  activeEntries: Set<string>,
  keep: Set<string>,
  onlyPrefix: string | undefined,
  isRoot: boolean,
  out: Set<string>,
): void {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const isSymlink = entry.isSymbolicLink();
    if (!entry.isDirectory() && !isSymlink) continue;
    if (isRoot) {
      if (keep.has(entry.name)) continue;
      if (onlyPrefix !== undefined && !entry.name.startsWith(onlyPrefix)) continue;
    }

    const full = join(dir, entry.name);
    const rel = relSlash(base, full);

    if (activeEntries.has(rel)) {
      out.add(rel); // a real, currently-active leaf -- never descend into it
      continue;
    }

    const isAncestorOfActive = [...activeEntries].some((active) => active.startsWith(`${rel}/`));
    if (isAncestorOfActive) {
      if (isSymlink) continue; // shouldn't happen -- only leaves are symlinked -- but be safe
      collectComposedLeaves(base, full, activeEntries, keep, onlyPrefix, false, out);
      continue;
    }

    if (hasRouteFile(full)) {
      out.add(rel); // an orphaned leaf -- not active, not an ancestor of one
      continue;
    }
    if (isSymlink) continue; // an orphaned symlink with no page/layout directly inside

    collectComposedLeaves(base, full, activeEntries, keep, onlyPrefix, false, out);
  }
}

/**
 * Defense-in-depth guard, independent of whether the recursive prune above
 * is correct: after pruning, every remaining composed route leaf under each
 * base directory must be in that base's own active-entries set. A leaf that
 * survives without a matching active entry means the generated route tree
 * and the registry have drifted — Next.js's App Router resolves routes
 * purely from disk, so this is exactly the shape of bug that lets a stale
 * route keep serving with none of the runtime's access-control gating
 * (which only ever runs for a path the *current* registry recognizes).
 * Fails the build loudly rather than composing a silently-inconsistent tree.
 */
export function assertNoOrphanedRouteDirectories(
  bases: {
    dir: string;
    activeEntries: Set<string>;
    keep?: Set<string>;
    onlyPrefix?: string;
  }[],
): void {
  for (const { dir, activeEntries, keep, onlyPrefix } of bases) {
    const leaves = new Set<string>();
    collectComposedLeaves(dir, dir, activeEntries, keep ?? new Set(), onlyPrefix, true, leaves);
    const orphaned = [...leaves].filter((leaf) => !activeEntries.has(leaf));
    if (orphaned.length === 0) continue;

    console.error(
      `[generate] orphaned composed plugin route(s) found under ${dir} with no ` +
        'matching active registry entry (pruning should have removed these -- ' +
        'this indicates a bug in composePlugins/pruneGeneratedEntries):',
    );
    for (const leaf of orphaned) console.error(`  - ${join(dir, leaf)}`);
    process.exit(1);
  }
}

export function composePlugins(plugins: PluginEntry[], isProd: boolean): void {
  mkdirSync(PLATFORM_PLUGINS_DIR, { recursive: true });
  mkdirSync(MODAL_DIR, { recursive: true });
  mkdirSync(MINIMAL_DIR, { recursive: true });

  // Track the full relative path (e.g. "kiosk/display", not just its first
  // segment "kiosk") each active plugin occupies under each base dir, so
  // pruning can distinguish a stale nested route from a still-active sibling
  // sharing the same route-prefix parent segment. We copy FIRST so active
  // plugin routes are never absent — a clear-then-copy gap causes Next.js's
  // dev route watcher to briefly serve 404s for valid plugin routes.
  const activePlatform = new Set<string>();
  const activeModal = new Set<string>();
  const activeMinimal = new Set<string>();

  for (const { dir, manifest, baseDir } of plugins) {
    const srcApp = join(baseDir ?? PLUGINS_DIR, dir, 'app');
    if (!existsSync(srcApp)) continue;
    // The public path is the manifest routePrefix, not the source dir name.
    for (const dest of composeTargets(manifest)) {
      mkdirSync(dirname(dest), { recursive: true });
      linkOrCopyTarget(srcApp, dest, isProd);
      // Record the full relative path this occupies so we can prune stale
      // sibling dirs (at any depth) without touching what we just wrote.
      if (dest.startsWith(MODAL_DIR + sep)) {
        activeModal.add(relSlash(MODAL_DIR, dest));
      } else if (dest.startsWith(MINIMAL_DIR + sep)) {
        activeMinimal.add(relSlash(MINIMAL_DIR, dest));
      } else {
        activePlatform.add(relSlash(PLATFORM_PLUGINS_DIR, dest));
      }
    }
  }

  // Prune stale entries from removed or renamed plugins — after the copy so
  // active routes are never briefly missing.
  pruneGeneratedEntries(PLATFORM_PLUGINS_DIR, activePlatform, { keep: PLUGINS_DIR_KEEP });
  // Remove only generated interception copies from @modal; the hand-written
  // default.tsx, layout.tsx, and .gitignore are preserved by the `(!startsWith)`
  // guard above (they are not `(.)*` prefixed).
  pruneGeneratedEntries(MODAL_DIR, activeModal, { onlyPrefix: '(.)' });
  pruneGeneratedEntries(MINIMAL_DIR, activeMinimal, { keep: MINIMAL_DIR_KEEP });

  // Defense in depth: fail loudly if pruning above left anything orphaned,
  // independent of whether the recursive prune logic itself is correct.
  assertNoOrphanedRouteDirectories([
    { dir: PLATFORM_PLUGINS_DIR, activeEntries: activePlatform, keep: PLUGINS_DIR_KEEP },
    { dir: MODAL_DIR, activeEntries: activeModal, onlyPrefix: '(.)' },
    { dir: MINIMAL_DIR, activeEntries: activeMinimal, keep: MINIMAL_DIR_KEEP },
  ]);
}
