import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS_DIR, '..');

function parseEnvValue(raw) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadRootEnv(root) {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    process.env[key] = parseEnvValue(trimmed.slice(eq + 1));
  }
}

function usage() {
  console.error('Usage: node scripts/next-server.mjs <auth|runtime> <dev|start>');
  process.exit(1);
}

function resolvePort(app) {
  const raw =
    app === 'auth'
      ? (process.env.AUTH_PORT ?? process.env.PORT ?? '3001')
      : (process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000');
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[next-server] Invalid ${app} port: ${raw}`);
    process.exit(1);
  }

  return String(port);
}

const app = process.argv[2];
const mode = process.argv[3];

if ((app !== 'auth' && app !== 'runtime') || (mode !== 'dev' && mode !== 'start')) {
  usage();
}

loadRootEnv(ROOT);

const cwd = app === 'auth' ? join(ROOT, 'apps', 'auth') : join(ROOT, 'runtime');
const port = resolvePort(app);

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
