import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv, DEV_APPS, resolveAppPort } from './dev-ports.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS_DIR, '..');

function usage() {
  console.error(
    `Usage: node scripts/next-server.mjs <${Object.keys(DEV_APPS).join('|')}> <dev|start>`,
  );
  process.exit(1);
}

const app = process.argv[2];
const mode = process.argv[3];

if (!Object.hasOwn(DEV_APPS, app) || (mode !== 'dev' && mode !== 'start')) {
  usage();
}

loadRootEnv(ROOT);

const cwd = join(ROOT, ...DEV_APPS[app].cwd);
let port;
try {
  port = resolveAppPort(app);
} catch (err) {
  console.error(`[next-server] ${err.message}`);
  process.exit(1);
}

console.log(`[next-server] starting ${app} ${mode} on port ${port}`);

const child = spawn('next', [mode, '--port', port], {
  cwd,
  stdio: 'inherit',
  env: { ...process.env, PORT: port },
});

let exiting = false;

function forward(signal) {
  if (exiting) return;
  exiting = true;
  child.kill(signal);
}

process.on('SIGINT', () => {
  forward('SIGINT');
});

process.on('SIGTERM', () => {
  forward('SIGTERM');
});

child.on('error', (error) => {
  console.error(`[next-server] failed to start ${app}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(128 + (osConstants.signals[signal] ?? 1));
    return;
  }
  process.exit(code ?? 0);
});
