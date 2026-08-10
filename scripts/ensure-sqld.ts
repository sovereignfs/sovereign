/**
 * Ensures a local sqld instance is running before `pnpm dev` starts the
 * runtime/auth dev servers. SQLite is sqld-backed only now (no plain-file
 * fallback) — unlike the old zero-config `file:./data/sovereign.db` default,
 * `scripts/dev.ts` (a plain Node orchestrator with no service management of
 * its own) has no way to make the database "just exist" on its own anymore.
 *
 * Runs once, before `turbo dev` fans out into the runtime's and auth's
 * separate dev processes (see root package.json's `dev` script) — those two
 * run in parallel with no ordering between them, so this can't live inside
 * either one without a race on which starts sqld first.
 *
 * Uses its own container (`sovereign-sqld-dev`) and volume
 * (`sovereign_sqld_dev_data`), deliberately distinct from docker-compose.yml's
 * `sovereign-sqld`/`sovereign_sqld_data` — running `pnpm dev` and
 * `docker compose up` side by side (or switching between them) should never
 * make one silently see the other's data, or fight over one container name.
 *
 * A no-op for DB_DIALECT=postgres — that dialect manages its own server
 * (docker-compose.postgres.yml or an external instance), nothing to start
 * here.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from './load-root-env';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadRootEnv(ROOT);

const CONTAINER_NAME = 'sovereign-sqld-dev';
const VOLUME_NAME = 'sovereign_sqld_dev_data';
// Must match packages/db/src/sqld.ts's / apps/auth/src/db.ts's default
// SQLD_URL/SQLD_ADMIN_URL — native dev has no Docker network to resolve the
// `sqld` hostname docker-compose.yml uses, so both default to localhost.
// Deliberately NOT 8080/8081 (sqld's own internal container ports, still
// used as-is inside the container) — found live, on a real machine, that
// 8080 is a very commonly-squatted local dev port (Tomcat, Jenkins, other
// projects' own dev servers); picking an uncommon pair for the *host-side*
// mapping avoids joining that collision-prone crowd.
const CLIENT_PORT = 28080;
const ADMIN_PORT = 28081;

function dbDialect(): string {
  const explicit = process.env.DB_DIALECT?.toLowerCase();
  return explicit === 'sqlite' || explicit === 'postgres' ? explicit : 'sqlite';
}

function run(command: string, args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { status: result.status, stdout: (result.stdout ?? '').trim() };
}

async function waitForHealthy(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // localhost, not 127.0.0.1: sqld's --enable-namespaces mode infers the
      // default (no x-namespace header) namespace from the Host header's
      // first dot-separated label — an IP address gets misparsed as a
      // namespace name and every unnamespaced request 404s. Found live; see
      // packages/db/src/__tests__/sqld.sqld.test.ts's doc comment.
      const res = await fetch(`http://localhost:${CLIENT_PORT}/health`);
      if (res.ok) return true;
    } catch {
      // Not up yet — keep polling.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main(): Promise<void> {
  if (dbDialect() !== 'sqlite') return; // Postgres manages its own server.

  const docker = run('docker', ['info']);
  if (docker.status !== 0) {
    console.error(
      '[ensure-sqld] DB_DIALECT=sqlite requires a running sqld instance, which `pnpm dev` ' +
        'starts automatically via Docker — but Docker does not appear to be running. Start ' +
        'Docker Desktop (or your Docker daemon) and try again, or set DB_DIALECT=postgres and ' +
        'POSTGRES_DB_URL in .env to use Postgres instead.',
    );
    process.exit(1);
  }

  const status = run('docker', ['inspect', '-f', '{{.State.Status}}', CONTAINER_NAME]);

  if (status.status !== 0) {
    // Container doesn't exist yet — create it.
    console.log(
      '[ensure-sqld] Starting local sqld (first run — this creates a persistent container)...',
    );
    const created = run('docker', [
      'run',
      '-d',
      '--name',
      CONTAINER_NAME,
      '-p',
      `${CLIENT_PORT}:8080`,
      '-p',
      `${ADMIN_PORT}:8081`,
      '-e',
      'SQLD_NODE=primary',
      '-e',
      'SQLD_ADMIN_LISTEN_ADDR=0.0.0.0:8081',
      '-v',
      `${VOLUME_NAME}:/var/lib/sqld`,
      'ghcr.io/tursodatabase/libsql-server:latest',
      '/bin/sqld',
      '--enable-namespaces',
    ]);
    if (created.status !== 0) {
      console.error('[ensure-sqld] Failed to start the sqld container — see output above.');
      process.exit(1);
    }
  } else if (status.stdout !== 'running') {
    // Exists but stopped (e.g. after a host reboot) — restart the same
    // container so its data (and the volume) carries over.
    console.log('[ensure-sqld] Restarting existing sqld container...');
    const started = run('docker', ['start', CONTAINER_NAME]);
    if (started.status !== 0) {
      console.error('[ensure-sqld] Failed to restart the existing sqld container.');
      process.exit(1);
    }
  } else {
    // Already running — fast path, no output needed on every `pnpm dev`.
    if (await waitForHealthy(2000)) return;
  }

  console.log('[ensure-sqld] Waiting for sqld to become healthy...');
  const healthy = await waitForHealthy(30000);
  if (!healthy) {
    console.error(
      `[ensure-sqld] sqld did not become healthy within 30s. Check its logs: ` +
        `docker logs ${CONTAINER_NAME}`,
    );
    process.exit(1);
  }
  console.log('[ensure-sqld] sqld is ready.');
}

await main();
