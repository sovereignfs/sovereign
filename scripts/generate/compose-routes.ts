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

export function pruneGeneratedEntries(
  dir: string,
  activeEntries: Set<string>,
  options: { keep?: Set<string>; onlyPrefix?: string } = {},
): void {
  const keep = options.keep ?? new Set<string>();
  for (const entry of readdirSync(dir)) {
    if (keep.has(entry) || activeEntries.has(entry)) continue;
    if (options.onlyPrefix !== undefined && !entry.startsWith(options.onlyPrefix)) continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

export function composePlugins(plugins: PluginEntry[], isProd: boolean): void {
  mkdirSync(PLATFORM_PLUGINS_DIR, { recursive: true });
  mkdirSync(MODAL_DIR, { recursive: true });
  mkdirSync(MINIMAL_DIR, { recursive: true });

  // Track which first-level child dir under each base dir is occupied by an
  // active plugin so stale entries can be pruned after copying. We copy FIRST
  // so active plugin routes are never absent — a clear-then-copy gap causes
  // Next.js's dev route watcher to briefly serve 404s for valid plugin routes.
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
      // Record which first-level segment this occupies so we can prune stale
      // sibling dirs without touching the ones we just wrote.
      const firstSeg = (base: string) => relative(base, dest).split(sep)[0] ?? '';
      if (dest.startsWith(MODAL_DIR + sep)) {
        activeModal.add(firstSeg(MODAL_DIR));
      } else if (dest.startsWith(MINIMAL_DIR + sep)) {
        activeMinimal.add(firstSeg(MINIMAL_DIR));
      } else {
        activePlatform.add(firstSeg(PLATFORM_PLUGINS_DIR));
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
}
