/**
 * dev — runtime development orchestrator.
 *
 * Plugins compose into the runtime App Router as copies in dev (see
 * `scripts/generate-registry.ts` for why this differs from production, which
 * uses symlinks): Next's dev route watcher does not follow symlinked route
 * directories, so a symlinked plugin route 404s under `next dev`. To preserve
 * live-edit DX, this script runs the generate watcher — which re-copies on any
 * change under `plugins/` — alongside the Next dev server.
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
import { loadRootEnv } from './load-root-env';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS_DIR, '..');
const RUNTIME_DIR = join(ROOT, 'runtime');
const GENERATE = join(SCRIPTS_DIR, 'generate-registry.ts');
const INSTALL_PLUGINS = join(SCRIPTS_DIR, 'install-plugins.ts');
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

// 0. Best-effort: clone any declared plugins (the example plugins, plus any
// external plugins in sovereign.plugins.json) at their pinned refs. Non-fatal —
// if it fails (e.g. offline) dev still starts with whatever is already present,
// you just develop without the freshly-declared plugins until the next run.
const install = spawnSync('tsx', [INSTALL_PLUGINS], { cwd: ROOT, stdio: 'inherit' });
if (install.status !== 0) {
  console.warn(
    '[dev] install-plugins did not complete — continuing without the declared external/example plugins.',
  );
}

// 1. Compose plugins once, before Next's first route scan.
const initial = spawnSync('tsx', [GENERATE], { cwd: ROOT, stdio: 'inherit' });
if (initial.status !== 0) process.exit(initial.status ?? 1);

// 2. Re-copy on plugin changes. 3. Start the Next dev server.
start('tsx', [GENERATE, '--watch'], ROOT);
start('next', ['dev', '--port', RUNTIME_PORT], RUNTIME_DIR);
