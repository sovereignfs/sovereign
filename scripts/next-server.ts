import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from './load-root-env';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS_DIR, '..');

const app = process.argv[2];
const mode = process.argv[3];

if ((app !== 'auth' && app !== 'runtime') || (mode !== 'dev' && mode !== 'start')) {
  console.error('Usage: tsx scripts/next-server.ts <auth|runtime> <dev|start>');
  process.exit(1);
}

loadRootEnv(ROOT);

const cwd = app === 'auth' ? join(ROOT, 'apps', 'auth') : join(ROOT, 'runtime');
const port =
  app === 'auth'
    ? (process.env.AUTH_PORT ?? process.env.PORT ?? '3001')
    : (process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000');

const child = spawn('next', [mode, '--port', port], {
  cwd,
  stdio: 'inherit',
  env: { ...process.env, PORT: port },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
