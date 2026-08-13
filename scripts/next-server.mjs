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

// Each entry: where the app's Next.js project lives (relative to ROOT), and
// the env var + fallback port used when PORT itself isn't set.
const APPS = {
  auth: { cwd: ['apps', 'auth'], portEnv: 'AUTH_PORT', defaultPort: '3001' },
  runtime: { cwd: ['runtime'], portEnv: 'RUNTIME_PORT', defaultPort: '3000' },
  relay: { cwd: ['apps', 'relay'], portEnv: 'RELAY_PORT', defaultPort: '3002' },
  harness: { cwd: ['apps', 'harness'], portEnv: 'HARNESS_PORT', defaultPort: '3003' },
};

function usage() {
  console.error(`Usage: node scripts/next-server.mjs <${Object.keys(APPS).join('|')}> <dev|start>`);
  process.exit(1);
}

function resolvePort(app) {
  const raw = process.env[APPS[app].portEnv] ?? process.env.PORT ?? APPS[app].defaultPort;
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[next-server] Invalid ${app} port: ${raw}`);
    process.exit(1);
  }

  return String(port);
}

const app = process.argv[2];
const mode = process.argv[3];

if (!Object.hasOwn(APPS, app) || (mode !== 'dev' && mode !== 'start')) {
  usage();
}

loadRootEnv(ROOT);

const cwd = join(ROOT, ...APPS[app].cwd);
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
