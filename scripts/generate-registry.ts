/**
 * generate-registry — composes installed plugins into the runtime.
 *
 * Scans `plugins/<dir>/manifest.json`, validates each via `@sovereignfs/manifest`,
 * writes the typed plugin registry to `runtime/generated/registry.ts`, and copies
 * each plugin's `app/` into the runtime App Router at its `routePrefix`. An
 * invalid manifest fails the build.
 *
 * Copies, not symlinks, in every environment: Next's dev route watcher does not
 * follow symlinked route directories, so a symlinked plugin would 404 under
 * `next dev` (it works under `next build`, which does follow them). Copying
 * keeps dev and prod identical. The dev orchestrator (`scripts/dev.ts`) runs
 * this in `--watch` mode so edits under `plugins/` re-copy and trigger HMR.
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
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkCompatibility,
  findApiProvider,
  pluginCapabilityName,
  toEnvVarName,
  validateManifest,
  type SovereignManifest,
} from '@sovereignfs/manifest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS_DIR = join(ROOT, 'plugins');
const PLUGIN_ICONS_DIR = join(ROOT, 'runtime', 'public', 'plugin-icons');
const PLUGIN_ENV_FILE = join(ROOT, 'runtime', 'generated', 'plugin-env.ts');
const PLUGIN_CAPABILITIES_FILE = join(ROOT, 'runtime', 'generated', 'plugin-capabilities.ts');

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

interface PluginEntry {
  dir: string;
  manifest: SovereignManifest;
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

  plugins.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));

  // PLT-16: at most one plugin may serve the public /api/* namespace. Fail
  // loudly rather than picking one non-deterministically at request time.
  const { duplicates } = findApiProvider(plugins.map((p) => p.manifest));
  if (duplicates.length > 1) {
    console.error(
      '[generate] more than one plugin declares apiProvider: true — exactly one ' +
        'API provider is allowed per instance (PLT-16):',
    );
    for (const m of duplicates) console.error(`  - ${m.id}`);
    process.exit(1);
  }

  return plugins;
}

function writeRegistry(plugins: PluginEntry[]): void {
  mkdirSync(dirname(REGISTRY_FILE), { recursive: true });
  const manifests = plugins.map((p) => p.manifest);
  const content = `// AUTO-GENERATED by scripts/generate-registry.ts — do not edit.
// Run \`pnpm generate\` to regenerate.
import type { SovereignManifest } from '@sovereignfs/manifest';

export const registry: SovereignManifest[] = ${JSON.stringify(manifests, null, 2)};
`;
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
 * Exits the process with a clear error for invalid combinations.
 */
function composeTargets(manifest: SovereignManifest): string[] {
  const shell = manifest.shell ?? 'default';
  const routeSegment = manifest.routePrefix.replace(/^\/+/, '');
  const fallback = join(PLATFORM_PLUGINS_DIR, routeSegment);

  if (shell === 'minimal') {
    return [join(MINIMAL_DIR, routeSegment)];
  }

  if (shell === 'overlay') {
    // The (.) interception convention matches a same-level URL segment, so an
    // overlay plugin's routePrefix must be a single segment in v1.
    if (routeSegment.includes('/')) {
      console.error(
        `[generate] plugin ${manifest.id} declares shell: "overlay" with a multi-segment ` +
          `routePrefix "${manifest.routePrefix}". Overlay plugins must use a single-segment ` +
          'routePrefix (e.g. /console) so the interception route resolves correctly.',
      );
      process.exit(1);
    }
    return [fallback, join(MODAL_DIR, `(.)${routeSegment}`)];
  }

  return [fallback];
}

function composePlugins(plugins: PluginEntry[]): void {
  // Clear composed plugin segments from the (plugins) group, keeping the
  // hand-written files (the .gitignore, the overlay-slot host layout.tsx, and
  // the @modal slot dir — its interception copies are cleared separately below).
  mkdirSync(PLATFORM_PLUGINS_DIR, { recursive: true });
  for (const entry of readdirSync(PLATFORM_PLUGINS_DIR)) {
    if (PLUGINS_DIR_KEEP.has(entry)) continue;
    rmSync(join(PLATFORM_PLUGINS_DIR, entry), { recursive: true, force: true });
  }
  // Clear only the generated interception copies in the @modal slot — the
  // hand-written default.tsx, layout.tsx (Dialog chrome), and .gitignore stay.
  mkdirSync(MODAL_DIR, { recursive: true });
  for (const entry of readdirSync(MODAL_DIR)) {
    if (entry.startsWith('(.)')) {
      rmSync(join(MODAL_DIR, entry), { recursive: true, force: true });
    }
  }
  // Clear composed route segments from the (minimal) group, keeping the
  // committed layout.tsx, minimal.module.css, and .gitignore.
  mkdirSync(MINIMAL_DIR, { recursive: true });
  for (const entry of readdirSync(MINIMAL_DIR)) {
    if (MINIMAL_DIR_KEEP.has(entry)) continue;
    rmSync(join(MINIMAL_DIR, entry), { recursive: true, force: true });
  }

  for (const { dir, manifest } of plugins) {
    const srcApp = join(PLUGINS_DIR, dir, 'app');
    if (!existsSync(srcApp)) continue;
    // The public path is the manifest routePrefix, not the source dir name.
    for (const dest of composeTargets(manifest)) {
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(srcApp, dest, { recursive: true });
    }
  }
}

/**
 * Copy each plugin's `icon.svg` into `runtime/public/plugin-icons/<id>.svg`
 * so it can be served statically at `/plugin-icons/<id>.svg` without a session
 * gate. The directory is gitignored (generated artifact, same as composed routes).
 */
function copyPluginIcons(plugins: PluginEntry[]): void {
  mkdirSync(PLUGIN_ICONS_DIR, { recursive: true });
  // Clear stale icons from removed plugins.
  for (const entry of readdirSync(PLUGIN_ICONS_DIR)) {
    const id = entry.replace(/\.svg$/, '');
    if (!plugins.some((p) => p.manifest.id === id)) {
      rmSync(join(PLUGIN_ICONS_DIR, entry), { force: true });
    }
  }
  for (const { dir, manifest } of plugins) {
    const src = join(PLUGINS_DIR, dir, 'icon.svg');
    if (existsSync(src)) {
      cpSync(src, join(PLUGIN_ICONS_DIR, `${manifest.id}.svg`));
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin-scoped environment variable processing (RFC 0018)
// ---------------------------------------------------------------------------

interface EnvDecl {
  pluginId: string;
  key: string;
  namespacedKey: string;
  required: boolean;
  secret: boolean;
  scope: 'build' | 'runtime';
  defaultValue: string | undefined;
}

/** Parse a simple KEY=VALUE .env file; ignores blank lines and # comments. */
function parseEnvFile(content: string): Record<string, string> {
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
function processPluginEnv(plugins: PluginEntry[]): EnvDecl[] {
  const decls: EnvDecl[] = [];
  const namespacedKeys = new Map<string, string>(); // namespacedKey → pluginId

  for (const { dir, manifest } of plugins) {
    if (!manifest.env) continue;

    // Read the plugin's optional .env file for dev defaults.
    const envFilePath = join(PLUGINS_DIR, dir, '.env');
    let pluginDotEnv: Record<string, string> = {};
    if (existsSync(envFilePath)) {
      pluginDotEnv = parseEnvFile(readFileSync(envFilePath, 'utf8'));
    }

    for (const [key, decl] of Object.entries(manifest.env)) {
      // Security: secret vars must never appear in the plugin's .env file — even
      // though .env is gitignored, secrets in a plain file can be unintentionally
      // shared (sent as attachments, checked into a fork, etc.).
      if (decl.secret === true && key in pluginDotEnv) {
        console.error(
          `[generate] plugin ${manifest.id}: env key "${key}" is marked secret but ` +
            `has a value in plugins/${dir}/.env. ` +
            'Set secret vars in the process environment — never in a .env file.',
        );
        process.exit(1);
      }

      const namespacedKey = toEnvVarName(manifest.id, key, decl.scope);

      // Detect cross-plugin namespace collisions (same namespaced key from two plugins).
      const existing = namespacedKeys.get(namespacedKey);
      if (existing && existing !== manifest.id) {
        console.error(
          `[generate] env namespace collision: "${namespacedKey}" is declared by ` +
            `both "${existing}" and "${manifest.id}". Rename one plugin's key to resolve.`,
        );
        process.exit(1);
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

  return decls;
}

/**
 * Emit `runtime/generated/plugin-env.ts` — a startup loader that applies
 * manifest defaults (and, in dev, plugin .env values) to `process.env`. Also
 * logs operator-facing warnings for required-but-absent secret vars.
 */
function writePluginEnv(decls: EnvDecl[]): void {
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

  const content = `// AUTO-GENERATED by scripts/generate-registry.ts — do not edit.
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

  writeFileSync(PLUGIN_ENV_FILE, content);
}

/**
 * Emit `runtime/generated/plugin-capabilities.ts` — the pre-computed list of
 * plugin-declared capabilities. The middleware imports `ALL_GRANTED_PLUGIN_CAPS`
 * to inject auto-granted capabilities into every authenticated session alongside
 * the platform-role capabilities (RFC 0022).
 */
function writePluginCapabilities(plugins: PluginEntry[]): void {
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

  const content = `// AUTO-GENERATED by scripts/generate-registry.ts — do not edit.
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

  writeFileSync(PLUGIN_CAPABILITIES_FILE, content);
}

function generate(): void {
  const plugins = readPlugins();
  writeRegistry(plugins);
  composePlugins(plugins);
  copyPluginIcons(plugins);
  const envDecls = processPluginEnv(plugins);
  writePluginEnv(envDecls);
  writePluginCapabilities(plugins);
  console.log(`[generate] ${String(plugins.length)} plugin(s) composed.`);
}

generate();

if (process.argv.includes('--watch')) {
  console.log('[generate] watching plugins/ for changes…');
  let timer: NodeJS.Timeout | undefined;
  watch(PLUGINS_DIR, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(generate, 150);
  });
}
