/**
 * generate-registry — composes installed plugins into the runtime.
 *
 * Scans `plugins/<dir>/manifest.json`, validates each via `@sovereignfs/manifest`,
 * writes the typed plugin registry to `runtime/generated/registry.ts`, and links
 * each plugin's `app/` into the runtime App Router at its `routePrefix`. An
 * invalid manifest fails the build.
 *
 * Copies in dev, symlinks in production (`NODE_ENV`) — deliberately different
 * per environment, revisiting an earlier version of this file that used copies
 * everywhere:
 *   - Dev must use copies. Next's dev route watcher does not discover routes
 *     through symlinked directories — a symlinked plugin genuinely 404s under
 *     `next dev` (verified against Next 15.5.19; this is not an old/fixed
 *     limitation). `scripts/dev.ts` runs this in `--watch` mode so edits under
 *     `plugins/` re-copy and trigger HMR.
 *   - Production uses a symlink instead of a copy specifically so a composed
 *     plugin's imports resolve through *its own* `node_modules` (correct pnpm
 *     per-package isolation) rather than requiring every dependency a bundled
 *     plugin happens to use to also be hand-declared in `runtime/package.json`
 *     — a copy severs the file from its originating package, which is what
 *     broke the first production build that bundled a plugin with
 *     dependencies `runtime` didn't already have (`@dnd-kit/*`, `rrule` for
 *     Tasks). `next build`'s webpack does follow the symlink correctly; only
 *     `next dev`'s route discovery doesn't.
 *   - TypeScript's own module resolution does not follow the symlink to find
 *     a plugin's `node_modules` either (confirmed: `preserveSymlinks` doesn't
 *     change this) — so `runtime/tsconfig.json` excludes composed plugin
 *     directories from its own type-check scope. This isn't a loss: each
 *     plugin already typechecks itself in its own repo/CI.
 *
 * Composition target is chosen by the manifest `shell` value so the plugin
 * inherits the right layout from the route tree (no per-request branching):
 *   - `default` (or omitted) → `runtime/app/(platform)/(plugins)/<routePrefix>/`,
 *     which sits under the platform sidebar shell.
 *   - `minimal` → `runtime/app/(minimal)/<routeSegment>` — chrome-free,
 *     full-bleed; multi-segment routePrefix allowed (e.g. /kiosk/display).
 *     The session gate still applies (middleware is not bypassed).
 *
 * The route segment is the manifest `routePrefix` (not the source directory
 * name), so `routePrefix` is the single source of truth for a plugin's URL.
 *
 * Run via `pnpm generate`; the runtime dev script runs it before `next dev`.
 * Pass `--watch` to re-run when plugin directories are added or removed.
 *
 * See: SRS §3.9 Plugin Loading Model.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkCompatibility,
  findApiProvider,
  pluginCapabilityName,
  toEnvVarName,
  validateManifest,
  type SovereignManifest,
} from '@sovereignfs/manifest';

// See the module doc comment above for why this differs from dev: symlinks
// let a composed plugin resolve its own dependencies via its own
// node_modules, but Next's dev route watcher doesn't discover routes through
// symlinked directories, so dev must keep using real copies.
const isProd = process.env.NODE_ENV === 'production';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS_DIR = join(ROOT, 'plugins');
const PLUGIN_ICONS_DIR = join(ROOT, 'runtime', 'public', 'plugin-icons');
const PLUGIN_ENV_FILE = join(ROOT, 'runtime', 'generated', 'plugin-env.ts');
const PLUGIN_CAPABILITIES_FILE = join(ROOT, 'runtime', 'generated', 'plugin-capabilities.ts');
const PLUGIN_SCHEDULES_FILE = join(ROOT, 'runtime', 'generated', 'plugin-schedules.ts');
const GENERATED_DIR = join(ROOT, 'runtime', 'generated');

function readPlatformVersion(): string {
  try {
    return (
      (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: string })
        .version ?? '0.0.0'
    );
  } catch {
    return '0.0.0';
  }
}
// Default-shell plugins compose under the platform route group so they inherit
// the sidebar shell. `(plugins)` is a URL-transparent route group; the public
// path is the plugin's routePrefix.
const PLATFORM_PLUGINS_DIR = join(ROOT, 'runtime', 'app', '(platform)', '(plugins)');
// Overlay-shell interception copies (RFC 0001) compose under the @modal
// parallel-route slot *inside* the (plugins) group, as `(.)<routePrefix>`, so an
// overlay plugin's interception copy and its full-page fallback are
// folder-siblings within the same group (required for Next.js `(.)` interception
// to resolve). The slot's hand-written default.tsx + layout.tsx (Dialog chrome)
// live alongside and are preserved.
const MODAL_DIR = join(PLATFORM_PLUGINS_DIR, '@modal');
// Committed files inside (plugins) that the clear step must never delete.
const PLUGINS_DIR_KEEP = new Set(['.gitignore', 'layout.tsx', '@modal']);
// Minimal-shell plugins compose under (minimal) — chrome-free, full-bleed (RFC 0014).
const MINIMAL_DIR = join(ROOT, 'runtime', 'app', '(minimal)');
// Committed files inside (minimal) that the clear step must never delete.
const MINIMAL_DIR_KEEP = new Set(['.gitignore', 'layout.tsx', 'minimal.module.css']);
const REGISTRY_FILE = join(ROOT, 'runtime', 'generated', 'registry.ts');

export interface PluginEntry {
  dir: string;
  manifest: SovereignManifest;
}

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

export interface PluginEnvResult {
  ok: boolean;
  decls: EnvDecl[];
  error?: string;
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

function readPlugins(): PluginEntry[] {
  if (!existsSync(PLUGINS_DIR)) return [];
  const plugins: PluginEntry[] = [];

  for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(PLUGINS_DIR, entry.name, 'manifest.json');
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

    plugins.push({ dir: entry.name, manifest: result.manifest });
  }

  const sortedPlugins = sortPluginEntries(plugins);

  // Two directories declaring the same manifest id — most commonly a real
  // clone at plugins/<id> alongside a plugins/<id>.local dev override. Fail
  // loudly rather than composing both to the same routePrefix and letting the
  // nav rail render a broken duplicate React key at request time.
  const idDuplicates = duplicatePluginIds(sortedPlugins);
  if (idDuplicates.size > 0) {
    console.error('[generate] more than one plugin directory declares the same manifest id:');
    for (const [id, dirs] of idDuplicates) {
      console.error(`  - "${id}": ${dirs.join(', ')}`);
    }
    console.error(
      '  Remove one of the directories (a plugins/<id>.local dev override should ' +
        'make install-plugins.ts skip cloning the real plugins/<id> — see its ' +
        '"already installed" check).',
    );
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

export function renderRegistry(plugins: PluginEntry[]): string {
  const manifests = plugins.map((p) => p.manifest);
  return `// AUTO-GENERATED by scripts/generate-registry.ts — do not edit.
// Run \`pnpm generate\` to regenerate.
import type { SovereignManifest } from '@sovereignfs/manifest';

export const registry: SovereignManifest[] = ${JSON.stringify(manifests, null, 2)};
`;
}

function writeRegistry(plugins: PluginEntry[]): void {
  mkdirSync(dirname(REGISTRY_FILE), { recursive: true });
  const content = renderRegistry(plugins);
  writeFileSync(REGISTRY_FILE, content);
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
 * `isProd` is an explicit parameter (rather than reading the module-level
 * `isProd` directly) so this is a pure, independently-testable unit.
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

function composePlugins(plugins: PluginEntry[]): void {
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

  for (const { dir, manifest } of plugins) {
    const srcApp = join(PLUGINS_DIR, dir, 'app');
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

/**
 * Copy each plugin's `icon.svg` into `runtime/public/plugin-icons/<id>.svg`
 * so it can be served statically at `/plugin-icons/<id>.svg` without a session
 * gate. The directory is gitignored (generated artifact, same as composed routes).
 */
function copyPluginIcons(plugins: PluginEntry[]): void {
  mkdirSync(PLUGIN_ICONS_DIR, { recursive: true });
  pruneStalePluginIcons(PLUGIN_ICONS_DIR, new Set(plugins.map((plugin) => plugin.manifest.id)));
  for (const { dir, manifest } of plugins) {
    const src = join(PLUGINS_DIR, dir, 'icon.svg');
    if (existsSync(src)) {
      cpSync(src, join(PLUGIN_ICONS_DIR, `${manifest.id}.svg`));
    }
  }
}

export function pruneStalePluginIcons(iconsDir: string, activePluginIds: Set<string>): void {
  for (const entry of readdirSync(iconsDir)) {
    const id = entry.replace(/\.svg$/, '');
    if (!activePluginIds.has(id)) {
      rmSync(join(iconsDir, entry), { force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin-scoped environment variable processing (RFC 0018)
// ---------------------------------------------------------------------------

export interface EnvDecl {
  pluginId: string;
  key: string;
  namespacedKey: string;
  required: boolean;
  secret: boolean;
  scope: 'build' | 'runtime';
  defaultValue: string | undefined;
}

/** Parse a simple KEY=VALUE .env file; ignores blank lines and # comments. */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1);
    // Strip optional surrounding quotes.
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
    result[key] = value;
  }
  return result;
}

/**
 * Process env declarations for all plugins:
 * 1. Read each plugin's optional `.env` file (dev defaults; gitignored).
 * 2. Fail if the `.env` contains a key the manifest marks `secret: true`.
 * 3. Detect namespace collisions (same namespaced key across different plugins).
 * 4. Return the full list of declarations with resolved dev values.
 */
export function collectPluginEnv(
  plugins: PluginEntry[],
  pluginsDir: string = PLUGINS_DIR,
): PluginEnvResult {
  const decls: EnvDecl[] = [];
  const namespacedKeys = new Map<string, string>(); // namespacedKey → pluginId

  for (const { dir, manifest } of plugins) {
    if (!manifest.env) continue;

    // Read the plugin's optional .env file for dev defaults.
    const envFilePath = join(pluginsDir, dir, '.env');
    let pluginDotEnv: Record<string, string> = {};
    if (existsSync(envFilePath)) {
      pluginDotEnv = parseEnvFile(readFileSync(envFilePath, 'utf8'));
    }

    for (const [key, decl] of Object.entries(manifest.env)) {
      // Security: secret vars must never appear in the plugin's .env file — even
      // though .env is gitignored, secrets in a plain file can be unintentionally
      // shared (sent as attachments, checked into a fork, etc.).
      if (decl.secret === true && key in pluginDotEnv) {
        return {
          ok: false,
          decls: [],
          error:
            `[generate] plugin ${manifest.id}: env key "${key}" is marked secret but ` +
            `has a value in plugins/${dir}/.env. ` +
            'Set secret vars in the process environment — never in a .env file.',
        };
      }

      const namespacedKey = toEnvVarName(manifest.id, key, decl.scope);

      // Detect cross-plugin namespace collisions (same namespaced key from two plugins).
      const existing = namespacedKeys.get(namespacedKey);
      if (existing && existing !== manifest.id) {
        return {
          ok: false,
          decls: [],
          error:
            `[generate] env namespace collision: "${namespacedKey}" is declared by ` +
            `both "${existing}" and "${manifest.id}". Rename one plugin's key to resolve.`,
        };
      }
      namespacedKeys.set(namespacedKey, manifest.id);

      // Effective default: manifest default takes precedence; .env value fills in
      // for non-secret keys when no manifest default is set (dev convenience).
      let defaultValue: string | undefined = decl.default;
      if (defaultValue === undefined && decl.secret !== true && key in pluginDotEnv) {
        defaultValue = pluginDotEnv[key];
      }

      decls.push({
        pluginId: manifest.id,
        key,
        namespacedKey,
        required: decl.required === true,
        secret: decl.secret === true,
        scope: decl.scope,
        defaultValue,
      });
    }
  }

  return { ok: true, decls };
}

function processPluginEnv(plugins: PluginEntry[]): EnvDecl[] {
  const result = collectPluginEnv(plugins);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  return result.decls;
}

/**
 * Emit `runtime/generated/plugin-env.ts` — a startup loader that applies
 * manifest defaults (and, in dev, plugin .env values) to `process.env`. Also
 * logs operator-facing warnings for required-but-absent secret vars.
 */
export function renderPluginEnv(decls: EnvDecl[]): string {
  const declsJson = JSON.stringify(
    decls.map((d) => ({
      pluginId: d.pluginId,
      key: d.key,
      namespacedKey: d.namespacedKey,
      required: d.required,
      secret: d.secret,
      scope: d.scope,
      // Never embed secret values — they must come from the process env.
      defaultValue: d.secret ? undefined : d.defaultValue,
    })),
    null,
    2,
  );

  return `// AUTO-GENERATED by scripts/generate-registry.ts — do not edit.
// Run \`pnpm generate\` to regenerate.

export interface PluginEnvDecl {
  pluginId: string;
  key: string;
  namespacedKey: string;
  required: boolean;
  secret: boolean;
  scope: 'build' | 'runtime';
  defaultValue?: string;
}

export const DECLARED_PLUGIN_ENV: PluginEnvDecl[] = ${declsJson};

/**
 * Apply declared plugin env-var defaults to \`process.env\`. Called once at
 * startup (via \`runtime/instrumentation.ts\`). Defaults are set only when the
 * key is absent — an operator-supplied value always wins.
 *
 * Also logs a warning for each required-but-absent env var so operators
 * know what to configure before the first request is served.
 */
export function loadPluginEnv(): void {
  const missing: string[] = [];

  for (const decl of DECLARED_PLUGIN_ENV) {
    if (decl.defaultValue !== undefined && !(decl.namespacedKey in process.env)) {
      process.env[decl.namespacedKey] = decl.defaultValue;
    }
    if (decl.required && !process.env[decl.namespacedKey]) {
      missing.push(decl.namespacedKey);
    }
  }

  if (missing.length > 0) {
    console.warn(
      '[sovereign] Required plugin env vars are not set — some plugin features may not work:',
    );
    for (const key of missing) {
      console.warn(\`  \${key}\`);
    }
  }
}
`;
}

function writePluginEnv(decls: EnvDecl[]): void {
  writeFileSync(PLUGIN_ENV_FILE, renderPluginEnv(decls));
}

/**
 * Emit `runtime/generated/plugin-capabilities.ts` — the pre-computed list of
 * plugin-declared capabilities. The middleware imports `ALL_GRANTED_PLUGIN_CAPS`
 * to inject auto-granted capabilities into every authenticated session alongside
 * the platform-role capabilities (RFC 0022).
 */
export function renderPluginCapabilities(plugins: PluginEntry[]): string {
  interface CapDecl {
    pluginId: string;
    capName: string;
    namespacedCap: string;
    description?: string;
    defaultGrant: 'all' | 'none';
  }

  const decls: CapDecl[] = [];
  for (const { manifest } of plugins) {
    if (!manifest.capabilities) continue;
    for (const [capName, capDecl] of Object.entries(manifest.capabilities)) {
      decls.push({
        pluginId: manifest.id,
        capName,
        namespacedCap: pluginCapabilityName(manifest.id, capName),
        description: capDecl.description,
        defaultGrant: capDecl.defaultGrant ?? 'none',
      });
    }
  }

  const allGranted = decls.filter((d) => d.defaultGrant === 'all').map((d) => d.namespacedCap);

  const declsJson = JSON.stringify(
    decls.map((d) => ({
      pluginId: d.pluginId,
      capName: d.capName,
      namespacedCap: d.namespacedCap,
      ...(d.description !== undefined ? { description: d.description } : {}),
      defaultGrant: d.defaultGrant,
    })),
    null,
    2,
  );

  const allGrantedJson = JSON.stringify(allGranted, null, 2);

  return `// AUTO-GENERATED by scripts/generate-registry.ts — do not edit.
// Run \`pnpm generate\` to regenerate.

export interface PluginCapabilityDecl {
  pluginId: string;
  capName: string;
  /** Fully-namespaced: \`<pluginId>:<capName>\` */
  namespacedCap: string;
  description?: string;
  defaultGrant: 'all' | 'none';
}

/** All plugin-declared capabilities across installed plugins. */
export const PLUGIN_CAPABILITIES: PluginCapabilityDecl[] = ${declsJson};

/**
 * Plugin capabilities with \`defaultGrant: 'all'\` — automatically granted to
 * every authenticated user. The middleware appends these to the platform-role
 * capabilities in the \`x-sovereign-user-capabilities\` header so
 * \`sdk.auth.hasCapability(session, '<pluginId>:<capName>')\` works without a
 * DB lookup (RFC 0022).
 */
export const ALL_GRANTED_PLUGIN_CAPS: string[] = ${allGrantedJson};
`;
}

function writePluginCapabilities(plugins: PluginEntry[]): void {
  writeFileSync(PLUGIN_CAPABILITIES_FILE, renderPluginCapabilities(plugins));
}

/** One manifest-declared schedule, resolved to an importable composed path. */
export interface ScheduleDecl {
  pluginId: string;
  scheduleId: string;
  intervalMinutes: number;
  /**
   * Module specifier relative to `runtime/generated/` (POSIX separators, no
   * `.ts` extension) pointing at the schedule's composed entry module inside
   * the runtime route tree.
   */
  importPath: string;
}

/**
 * Resolve every installed plugin's `schedules` declarations (RFC 0046 Phase 1)
 * to composed-route-tree import paths for `renderPluginSchedules`. Exits with
 * a clear error when a declared entry module does not exist in the plugin
 * source — a schedule that silently never runs is worse than a failed build.
 */
export function collectPluginSchedules(
  plugins: PluginEntry[],
  opts: { pluginsDir?: string; generatedDir?: string } = {},
): { decls: ScheduleDecl[]; error?: string } {
  const pluginsDir = opts.pluginsDir ?? PLUGINS_DIR;
  const generatedDir = opts.generatedDir ?? GENERATED_DIR;
  const decls: ScheduleDecl[] = [];

  for (const { dir, manifest } of plugins) {
    if (!manifest.schedules) continue;
    const targets = resolveComposeTargets(manifest);
    if (!targets.ok) return { decls: [], error: targets.error };
    // targets[0] is the plugin's primary composed app dir at every shell
    // (default/overlay → the (plugins) group; minimal → the (minimal) group).
    const baseTarget = targets.targets[0];
    for (const sched of manifest.schedules) {
      const srcFile = join(pluginsDir, dir, sched.entry);
      if (!existsSync(srcFile)) {
        return {
          decls: [],
          error:
            `[generate] plugin ${manifest.id} schedule "${sched.id}" declares entry ` +
            `"${sched.entry}" but that file does not exist in plugins/${dir}/.`,
        };
      }
      const composedFile = join(baseTarget, sched.entry.replace(/^app\//, ''));
      const importPath = relative(generatedDir, composedFile)
        .split(sep)
        .join('/')
        .replace(/\.ts$/, '');
      decls.push({
        pluginId: manifest.id,
        scheduleId: sched.id,
        intervalMinutes: sched.intervalMinutes,
        importPath,
      });
    }
  }

  return { decls };
}

/**
 * Emit `runtime/generated/plugin-schedules.ts` — static imports of every
 * manifest-declared schedule handler (RFC 0046 Phase 1), consumed by
 * `runtime/src/scheduler.ts` via `runtime/instrumentation.ts`. Static imports
 * (not dynamic paths) keep the handlers inside the Next.js build graph so the
 * standalone/production bundle traces them like any route module.
 */
export function renderPluginSchedules(decls: ScheduleDecl[]): string {
  const imports = decls
    .map((d, i) => `import handler${String(i)} from ${JSON.stringify(d.importPath)};`)
    .join('\n');
  const entries = decls
    .map(
      (d, i) =>
        `  {\n    pluginId: ${JSON.stringify(d.pluginId)},\n    scheduleId: ${JSON.stringify(
          d.scheduleId,
        )},\n    intervalMinutes: ${String(d.intervalMinutes)},\n    handler: handler${String(i)},\n  },`,
    )
    .join('\n');

  return `// AUTO-GENERATED by scripts/generate-registry.ts — do not edit.
// Run \`pnpm generate\` to regenerate.
${imports === '' ? '' : '\n' + imports + '\n'}
/**
 * The handler signature mirrors \`ScheduleHandler\` from \`@sovereignfs/sdk\`
 * structurally so this file needs no imports when no plugin declares
 * schedules (the committed default state).
 */
export interface PluginScheduleDecl {
  pluginId: string;
  scheduleId: string;
  intervalMinutes: number;
  handler: (ctx: { pluginId: string; scheduleId: string; headers: Headers }) => Promise<void>;
}

/** Every manifest-declared schedule across installed plugins (RFC 0046 Phase 1). */
export const PLUGIN_SCHEDULES: PluginScheduleDecl[] = [${
    entries === '' ? '' : '\n' + entries + '\n'
  }];
`;
}

function writePluginSchedules(plugins: PluginEntry[]): void {
  const result = collectPluginSchedules(plugins);
  if (result.error !== undefined) {
    console.error(result.error);
    process.exit(1);
  }
  writeFileSync(PLUGIN_SCHEDULES_FILE, renderPluginSchedules(result.decls));
}

export function generate(): void {
  const plugins = readPlugins();
  writeRegistry(plugins);
  composePlugins(plugins);
  copyPluginIcons(plugins);
  const envDecls = processPluginEnv(plugins);
  writePluginEnv(envDecls);
  writePluginCapabilities(plugins);
  writePluginSchedules(plugins);
  console.log(
    `[generate] ${String(plugins.length)} plugin(s) composed (${isProd ? 'symlink' : 'copy'}).`,
  );
}

function isCliEntrypoint(): boolean {
  return resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  generate();
}

if (isCliEntrypoint() && process.argv.includes('--watch')) {
  console.log('[generate] watching plugins/ for changes…');
  let timer: NodeJS.Timeout | undefined;
  watch(PLUGINS_DIR, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(generate, 150);
  });
}
