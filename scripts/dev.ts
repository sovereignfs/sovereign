/**
 * dev — runtime development orchestrator.
 *
 * Plugins compose into the runtime App Router as copies in dev (see
 * `scripts/generate-registry.ts` for why this differs from production, which
 * uses symlinks): Next's dev route watcher does not follow symlinked route
 * directories, so a symlinked plugin route 404s under `next dev`. To preserve
 * live-edit DX, this script runs the generate watcher — which re-copies on any
 * change under `plugins/` (and `example-plugins/`, when
 * `SOVEREIGN_EXAMPLES_ENABLED` is set) — alongside the Next dev server.
 *
 * Order matters: compose once synchronously so the routes exist before Next's
 * first scan, then start the watcher and the dev server. Ctrl+C — or any child
 * exiting — tears the whole session down, so no watcher is orphaned.
 *
 * `tsx` and `next` resolve via PATH, which pnpm populates with the workspace
 * `node_modules/.bin` when it runs the runtime `dev` script.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncLocalPluginDeps } from '../bin/plugin-deps';
import { loadRootEnv } from './load-root-env';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS_DIR, '..');
const RUNTIME_DIR = join(ROOT, 'runtime');
const PLUGINS_DIR = join(ROOT, 'plugins');
const GENERATE = join(SCRIPTS_DIR, 'generate-registry.ts');
const INSTALL_PLUGINS = join(SCRIPTS_DIR, 'install-plugins.ts');
const RUNTIME_PKG = join(RUNTIME_DIR, 'package.json');
const PLUGIN_DEPS_LEDGER = join(ROOT, 'runtime', 'generated', 'plugin-deps.json');
loadRootEnv(ROOT);

const RUNTIME_PORT = process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000';

const children = new Set<ChildProcess>();
let shuttingDown = false;

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

function start(command: string, args: string[], cwd: string): void {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  children.add(child);
  child.on('exit', (code) => {
    children.delete(child);
    shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => {
  shutdown(0);
});
process.on('SIGTERM', () => {
  shutdown(0);
});

// 0. Best-effort: clone any externally-hosted plugins declared in
// sovereign.plugins.json at their pinned refs. Example plugins are no longer
// cloned — they live in-repo under example-plugins/ (docs/epics/example-plugins.md,
// 2026-08-01 correction) and are composed directly by generate-registry.ts
// when SOVEREIGN_EXAMPLES_ENABLED is set. Non-fatal — if this fails (e.g.
// offline) dev still starts with whatever is already present, you just
// develop without the freshly-declared external plugins until the next run.
const install = spawnSync('tsx', [INSTALL_PLUGINS], { cwd: ROOT, stdio: 'inherit' });
if (install.status !== 0) {
  console.warn(
    '[dev] install-plugins did not complete — continuing without the declared external plugins.',
  );
}

// 0.5. Self-heal .local plugin dependencies (RFC 0057) — .local plugins
// bypass `sv plugin add`/`remove` entirely, so nothing else keeps
// runtime/package.json and the plugin-deps.json ledger in sync with them.
// Cheap to check (a handful of small JSON reads) every boot; only runs
// `pnpm install` when something actually changed.
const depsSync = syncLocalPluginDeps({
  pluginsDir: PLUGINS_DIR,
  runtimePkgPath: RUNTIME_PKG,
  ledgerPath: PLUGIN_DEPS_LEDGER,
  root: ROOT,
});
if (depsSync.changed) {
  console.log(`[dev] .local plugin dependencies changed — ${depsSync.summary.join('; ')}.`);
}

// 1. Compose plugins once, before Next's first route scan.
const initial = spawnSync('tsx', [GENERATE], { cwd: ROOT, stdio: 'inherit' });
if (initial.status !== 0) process.exit(initial.status ?? 1);

// 2. Re-copy on plugin changes. 3. Start the Next dev server.
start('tsx', [GENERATE, '--watch'], ROOT);
start('next', ['dev', '--port', RUNTIME_PORT], RUNTIME_DIR);
