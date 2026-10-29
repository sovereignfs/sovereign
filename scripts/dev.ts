/**
 * `pnpm dev`: starts core's development server, and first, when the development environment chooses sqld, a
 * persistent sqld in a container (docker-compose.dev.yml) so there is a database to talk to. With SQLite or
 * PostgreSQL chosen, or no Docker, it only starts the server and says so when that matters.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chosenDialect } from './lib/dev-database';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file: string) => {
  const full = path.join(root, 'apps/core', file);
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
};
const local = read('.env.local');
const env = read('.env');
const dialect = chosenDialect(process.env, {
  ...(local !== undefined ? { local } : {}),
  ...(env !== undefined ? { env } : {}),
});

if (dialect === 'sqld') {
  const docker = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (docker.status !== 0) {
    console.warn(
      'The development environment chooses sqld, but Docker is not running: start it, or choose SQLite.',
    );
  } else {
    console.log('Starting sqld (docker-compose.dev.yml)…');
    const up = spawnSync(
      'docker',
      ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d', '--wait', 'sqld'],
      { cwd: root, stdio: 'inherit' },
    );
    if (up.status !== 0) process.exit(up.status ?? 1);
  }
}

const server = spawn('pnpm', ['exec', 'turbo', 'dev'], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
