/**
 * install-plugins — clones the declared sovereign/community plugins into
 * `plugins/[id]/` and wires them into the runtime.
 *
 * Reads `sovereign.plugins.json` at the repo root:
 *
 *   {
 *     "plugins": [
 *       { "id": "fs.example.tasks", "repository": "https://github.com/org/repo" }
 *     ]
 *   }
 *
 * For each entry it clones `repository` into `plugins/<id>/` (shallow), skipping
 * any that already exist, then runs `pnpm generate` to compose them. Platform
 * plugins (console/launcher/account) live in this repo and are not listed here;
 * cloned plugins are gitignored (they have their own repositories).
 *
 * See: docs/roadmap.md — Task 0.5.00.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PluginEntry {
  id: string;
  repository: string;
}

export interface PluginsConfig {
  plugins: PluginEntry[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'sovereign.plugins.json');
const PLUGINS_DIR = join(ROOT, 'plugins');

/** Parse and validate `sovereign.plugins.json` content. Throws on malformed input. */
export function parsePluginsConfig(raw: string): PluginsConfig {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`sovereign.plugins.json is not valid JSON: ${(error as Error).message}`);
  }
  if (
    typeof json !== 'object' ||
    json === null ||
    !Array.isArray((json as { plugins?: unknown }).plugins)
  ) {
    throw new Error('sovereign.plugins.json must be an object with a "plugins" array.');
  }
  const entries = (json as { plugins: unknown[] }).plugins;
  const seen = new Set<string>();
  return {
    plugins: entries.map((entry, i) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(`plugins[${String(i)}] must be an object.`);
      }
      const { id, repository } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`plugins[${String(i)}].id must be a non-empty string.`);
      }
      if (typeof repository !== 'string' || repository.length === 0) {
        throw new Error(`plugins[${String(i)}].repository must be a non-empty string.`);
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate plugin id "${id}" in sovereign.plugins.json.`);
      }
      seen.add(id);
      return { id, repository };
    }),
  };
}

/**
 * Partition declared plugins into those to clone and those already installed,
 * using the supplied predicate (kept pure so the decision is unit-testable).
 */
export function planInstall(
  config: PluginsConfig,
  isInstalled: (id: string) => boolean,
): { toClone: PluginEntry[]; toSkip: PluginEntry[] } {
  const toClone: PluginEntry[] = [];
  const toSkip: PluginEntry[] = [];
  for (const entry of config.plugins) {
    (isInstalled(entry.id) ? toSkip : toClone).push(entry);
  }
  return { toClone, toSkip };
}

function main(): void {
  if (!existsSync(CONFIG_PATH)) {
    console.log(
      '[install-plugins] No sovereign.plugins.json at the repo root — nothing to install.',
    );
    return;
  }

  const config = parsePluginsConfig(readFileSync(CONFIG_PATH, 'utf8'));
  if (config.plugins.length === 0) {
    console.log('[install-plugins] No plugins declared in sovereign.plugins.json.');
    return;
  }

  const { toClone, toSkip } = planInstall(config, (id) => existsSync(join(PLUGINS_DIR, id)));

  for (const entry of toSkip) {
    console.log(`[install-plugins] ${entry.id} already present — skipping.`);
  }

  for (const entry of toClone) {
    const dest = join(PLUGINS_DIR, entry.id);
    console.log(`[install-plugins] cloning ${entry.id} from ${entry.repository} …`);
    try {
      execFileSync('git', ['clone', '--depth', '1', entry.repository, dest], { stdio: 'inherit' });
    } catch {
      console.error(
        `[install-plugins] Failed to clone ${entry.repository}. ` +
          'Check the URL is reachable and you have access.',
      );
      process.exit(1);
    }
  }

  if (toClone.length > 0) {
    console.log('[install-plugins] composing plugins (pnpm generate) …');
    execFileSync('pnpm', ['generate'], { cwd: ROOT, stdio: 'inherit' });
  }

  console.log(
    `[install-plugins] done — ${String(toClone.length)} cloned, ${String(toSkip.length)} already present.`,
  );
}

// Only run when invoked directly (e.g. `pnpm install:plugins`), not when the
// pure helpers above are imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
