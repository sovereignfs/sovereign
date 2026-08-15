import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toEnvVarName } from '@sovereignfs/manifest';
import { EXAMPLE_PLUGINS_DIR, PLUGINS_DIR, PLUGIN_ENV_FILE } from './paths';
import type { PluginEntry } from './types';

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

export interface PluginEnvResult {
  ok: boolean;
  decls: EnvDecl[];
  error?: string;
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

  for (const { dir, manifest, baseDir } of plugins) {
    if (!manifest.env) continue;

    // Read the plugin's optional .env file for dev defaults.
    const envFilePath = join(baseDir ?? pluginsDir, dir, '.env');
    let pluginDotEnv: Record<string, string> = {};
    if (existsSync(envFilePath)) {
      pluginDotEnv = parseEnvFile(readFileSync(envFilePath, 'utf8'));
    }

    for (const [key, decl] of Object.entries(manifest.env)) {
      // Security: secret vars must never appear in the plugin's .env file — even
      // though .env is gitignored, secrets in a plain file can be unintentionally
      // shared (sent as attachments, checked into a fork, etc.).
      if (decl.secret === true && key in pluginDotEnv) {
        const dirLabel = baseDir === EXAMPLE_PLUGINS_DIR ? 'example-plugins' : 'plugins';
        return {
          ok: false,
          decls: [],
          error:
            `[generate] plugin ${manifest.id}: env key "${key}" is marked secret but ` +
            `has a value in ${dirLabel}/${dir}/.env. ` +
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

export function processPluginEnv(plugins: PluginEntry[]): EnvDecl[] {
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

export function writePluginEnv(decls: EnvDecl[]): void {
  writeFileSync(PLUGIN_ENV_FILE, renderPluginEnv(decls));
}
