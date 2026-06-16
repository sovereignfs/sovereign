/**
 * sv — the Sovereign deployment CLI.
 *
 * A thin orchestrator: each command shells out to the existing `scripts/*.ts`
 * and `pnpm`/`turbo` rather than re-implementing their logic, so there is one
 * source of truth per operation. Run via `tsx` (no compile step), consistent
 * with the `scripts/` pattern. Canonical invocation is `pnpm sv <command>`;
 * `./bin/sv` works too via the sibling shell shim.
 *
 * Monorepo-internal in v1 — no global npm install path (SRS §2.2).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';

import { assertRemovablePlugin, resolvePluginIdFromManifest } from './helpers';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const PLUGINS_DIR = join(ROOT, 'plugins');
const GENERATE = join(SCRIPTS_DIR, 'generate-registry.ts');
const INSTALL = join(SCRIPTS_DIR, 'install-plugins.ts');

/**
 * Run a command to completion, inheriting stdio. Returns its exit code; exits
 * the CLI with that code on failure so delegated failures propagate.
 */
function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    consola.error(`Failed to run \`${command}\`: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const install = defineCommand({
  meta: { name: 'install', description: 'Clone the plugins declared in sovereign.plugins.json' },
  run() {
    run('tsx', [INSTALL]);
  },
});

const generate = defineCommand({
  meta: { name: 'generate', description: 'Compose installed plugins into the runtime' },
  run() {
    run('tsx', [GENERATE]);
  },
});

const build = defineCommand({
  meta: { name: 'build', description: 'Compose plugins, then build all packages and apps' },
  run() {
    run('tsx', [GENERATE]);
    run('pnpm', ['build']);
  },
});

const dev = defineCommand({
  meta: { name: 'dev', description: 'Start the runtime and auth server in development mode' },
  run() {
    // `pnpm dev` (turbo) runs the runtime dev orchestrator (:3000) and the auth
    // server (:3001). It is persistent; Ctrl+C propagates via inherited stdio.
    run('pnpm', ['dev']);
  },
});

const serve = defineCommand({
  meta: { name: 'serve', description: 'Start the runtime and auth server in production mode' },
  run() {
    // No single pnpm/turbo task starts both production servers, so orchestrate
    // the two `next start` processes directly — same mutual-teardown pattern as
    // scripts/dev.ts. Docker remains the canonical production path.
    const children = new Set<ChildProcess>();
    let shuttingDown = false;

    const shutdown = (code: number): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      for (const child of children) child.kill('SIGTERM');
      process.exit(code);
    };

    const start = (args: string[], cwd: string): void => {
      const child = spawn('next', args, { cwd, stdio: 'inherit' });
      children.add(child);
      child.on('exit', (code) => {
        children.delete(child);
        shutdown(code ?? 0);
      });
    };

    process.on('SIGINT', () => {
      shutdown(0);
    });
    process.on('SIGTERM', () => {
      shutdown(0);
    });

    consola.start('Starting Sovereign (runtime :3000, auth :3001) …');
    start(['start', '--port', '3000'], join(ROOT, 'runtime'));
    start(['start', '--port', '3001'], join(ROOT, 'apps', 'auth'));
  },
});

const pluginAdd = defineCommand({
  meta: { name: 'add', description: 'Clone a plugin from a git repository and compose it' },
  args: {
    repository: { type: 'positional', required: true, description: 'Git repository URL to clone' },
  },
  run({ args }) {
    const { repository } = args;
    // Clone into a temp dir inside plugins/ so the final move stays on one
    // filesystem (atomic rename), then key the destination off the manifest id.
    const tmp = mkdtempSync(join(PLUGINS_DIR, '.sv-add-'));
    const cleanup = (): void => rmSync(tmp, { recursive: true, force: true });

    const clone = spawnSync('git', ['clone', '--depth', '1', repository, tmp], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (clone.status !== 0) {
      cleanup();
      consola.error(
        `Failed to clone ${repository}. Check the URL is reachable and you have access.`,
      );
      process.exit(1);
    }

    const manifestPath = join(tmp, 'manifest.json');
    if (!existsSync(manifestPath)) {
      cleanup();
      consola.error(
        'The cloned repository has no manifest.json at its root — not a Sovereign plugin.',
      );
      process.exit(1);
    }

    let id: string;
    try {
      id = resolvePluginIdFromManifest(readFileSync(manifestPath, 'utf8'), ROOT);
    } catch (error) {
      cleanup();
      consola.error((error as Error).message);
      process.exit(1);
    }

    const dest = join(PLUGINS_DIR, id);
    if (existsSync(dest)) {
      cleanup();
      consola.error(`Plugin "${id}" is already installed (plugins/${id} exists).`);
      process.exit(1);
    }

    renameSync(tmp, dest);
    consola.success(`Installed "${id}" into plugins/${id}.`);
    run('tsx', [GENERATE]);
  },
});

const pluginRemove = defineCommand({
  meta: { name: 'remove', description: 'Remove an installed plugin and re-compose' },
  args: {
    id: { type: 'positional', required: true, description: 'Plugin directory name under plugins/' },
  },
  run({ args }) {
    const { id } = args;
    try {
      assertRemovablePlugin(id);
    } catch (error) {
      consola.error((error as Error).message);
      process.exit(1);
    }

    const dest = join(PLUGINS_DIR, id);
    if (!existsSync(dest)) {
      consola.error(`Plugin "${id}" is not installed (no plugins/${id}).`);
      process.exit(1);
    }

    rmSync(dest, { recursive: true, force: true });
    consola.success(`Removed plugins/${id}.`);
    run('tsx', [GENERATE]);
  },
});

const plugin = defineCommand({
  meta: { name: 'plugin', description: 'Add or remove individual plugins' },
  subCommands: { add: pluginAdd, remove: pluginRemove },
});

const main = defineCommand({
  meta: { name: 'sv', description: 'Sovereign deployment CLI' },
  subCommands: { install, generate, build, dev, serve, plugin },
});

void runMain(main);
