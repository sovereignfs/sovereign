import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { poolerClients, poolerPool, appPool } from '../suite/connections.js';
import type { Suite } from '../suite/types.js';
import { databaseOf } from './apps.js';
import { docker, ensureNetwork, ensureOnNetwork } from './docker.js';
import type { Host } from './host.js';
import { CONTAINER, NETWORK, POOLER_PORT, PROJECT } from './names.js';
import type { GeneratedSecrets } from './secrets.js';
import { layout } from './state.js';

/** Where the pooler's own account reaches its console, for `sv status`. A socket inside the container: no port, no password. */
export const POOLER_SOCKET_DIR = '/var/run/pgbouncer';
/** Where the pooler finds its files. */
export const POOLER_ETC = '/etc/pgbouncer';
export const POOLER_FILES = ['pgbouncer.ini', 'pg_hba.conf', 'userlist.txt'] as const;

/** The apps that go through the pooler: those whose manifest declares `transaction`, when it is on (contracts/suite.md §1.3). */
export type PooledApp = { name: string; password: string };

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * The pooler's three files (operator-cli §6.4.5). Transaction mode; clients are checked with SCRAM against the user list, which holds the
 * role passwords `sv apply` generated and nothing else; the console is reached only through the container's own socket by its own account.
 * Each app has one database in it, limited to the pool the operator gave it and never above what its role allows.
 */
export function poolerFiles(
  suite: Suite,
  apps: readonly PooledApp[],
): Record<(typeof POOLER_FILES)[number], string> {
  const databases = apps.map(({ name }) => {
    const database = databaseOf(name);
    const size = Math.min(poolerPool(suite), appPool(suite, name));
    return `${database} = host=${CONTAINER.database} port=5432 dbname=${database} pool_size=${size}`;
  });
  const ini = `; Written by sv apply. Do not edit it: it is written again on every deployment.
[databases]
${databases.join('\n')}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = ${POOLER_PORT}
unix_socket_dir = ${POOLER_SOCKET_DIR}
auth_type = hba
auth_hba_file = ${POOLER_ETC}/pg_hba.conf
auth_file = ${POOLER_ETC}/userlist.txt
admin_users = pgbouncer
pool_mode = transaction
max_client_conn = ${poolerClients(suite)}
default_pool_size = ${poolerPool(suite)}
ignore_startup_parameters = extra_float_digits
`;
  const hba = `local pgbouncer pgbouncer peer
host all all 0.0.0.0/0 scram-sha-256
host all all ::/0 scram-sha-256
`;
  const userlist = apps
    .map(({ name, password }) => `${quote(databaseOf(name))} ${quote(password)}\n`)
    .join('');
  return { 'pgbouncer.ini': ini, 'pg_hba.conf': hba, 'userlist.txt': userlist };
}

/**
 * Writes a file the pooler has mounted, in place: a file mounted alone goes stale when it is replaced, and a reload must see what was
 * written. Returns whether it changed.
 */
async function writeInPlace(file: string, text: string): Promise<boolean> {
  const existing = await stat(file).then(
    () => true,
    () => false,
  );
  if (existing && (await readFile(file, 'utf8')) === text) return false;
  if (existing) await chmod(file, 0o644);
  await writeFile(file, text, { mode: 0o644 });
  await chmod(file, 0o444);
  return true;
}

export type PoolerRun = {
  host: Host;
  suite: Suite;
  /** The release's folder, where the compose file for the pooler is. */
  release: string;
  stateDir: string;
  generated: GeneratedSecrets;
  /** Names of the apps that go through it. */
  pooled: readonly string[];
};

/**
 * Brings the pooler up, or makes it match (operator-cli §6.4.5): its files from the role passwords, its container, the networks of the apps
 * that go through it and no others, and a reload when its files changed under a container that was already running.
 */
export async function applyPooler(run: PoolerRun): Promise<void> {
  const { host, suite, generated } = run;
  const dir = layout(run.stateDir).pooler;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);

  const apps: PooledApp[] = [];
  for (const name of run.pooled) {
    await ensureNetwork(host, NETWORK.app(name));
    const password = await generated.ensure(`role-app-${name}-password`, () =>
      generated.random(24),
    );
    apps.push({ name, password: password.value });
  }
  const files = poolerFiles(suite, apps);
  let changed = false;
  for (const name of POOLER_FILES)
    changed = (await writeInPlace(path.join(dir, name), files[name])) || changed;

  const before = await containerId(host, CONTAINER.pooler);
  await docker(host, 'Starting the pooler', [
    'compose',
    '--project-name',
    PROJECT.pooler,
    '-f',
    path.join(run.release, 'pooler', 'compose.yml'),
    'up',
    '--detach',
    '--remove-orphans',
    '--wait',
    '--wait-timeout',
    '60',
  ]);
  const wanted = new Set(run.pooled.map((name) => NETWORK.app(name)));
  for (const name of run.pooled)
    await ensureOnNetwork(host, CONTAINER.pooler, NETWORK.app(name), []);
  await leaveOtherNetworks(host, wanted);
  if (changed && before !== undefined && before === (await containerId(host, CONTAINER.pooler))) {
    await docker(host, 'Telling the pooler to read its files again', [
      'kill',
      '--signal',
      'HUP',
      CONTAINER.pooler,
    ]);
  }
}

/** Takes the pooler off the network of any app that no longer goes through it. */
async function leaveOtherNetworks(host: Host, wanted: ReadonlySet<string>): Promise<void> {
  const found = await host.docker(['inspect', CONTAINER.pooler]);
  if (found.code !== 0) return;
  const networks = Object.keys(
    (
      JSON.parse(found.stdout) as {
        NetworkSettings?: { Networks?: Record<string, unknown> };
      }[]
    )[0]?.NetworkSettings?.Networks ?? {},
  );
  for (const network of networks) {
    if (network.startsWith('sv-net-app-') && !wanted.has(network))
      await docker(host, `Taking the pooler off ${network}`, [
        'network',
        'disconnect',
        network,
        CONTAINER.pooler,
      ]);
  }
}

async function containerId(host: Host, name: string): Promise<string | undefined> {
  const done = await host.docker(['inspect', '--format', '{{.Id}}', name]);
  return done.code === 0 ? done.stdout.trim() : undefined;
}

/** Removes the pooler and its files, when it is turned off. It kept no data, and every app is already back on the server itself. */
export async function removePooler(host: Host, stateDir: string): Promise<boolean> {
  const there = (await containerId(host, CONTAINER.pooler)) !== undefined;
  if (there) await docker(host, 'Removing the pooler', ['rm', '--force', CONTAINER.pooler]);
  await rm(layout(stateDir).pooler, { recursive: true, force: true });
  return there;
}

/** What the pooler holds for one app, as its console says (operator-cli §6.4.5). */
export type Pool = {
  database: string;
  clientsActive: number;
  clientsWaiting: number;
  serversActive: number;
  serversIdle: number;
};

/**
 * The pooler's pools, from its own console over the socket inside the container: one `SHOW POOLS`, whose header names the columns, so a
 * release that adds columns does not move them. `null` when it is not running or cannot be asked.
 */
export async function readPools(host: Host): Promise<Pool[] | null> {
  const done = await host.docker([
    'exec',
    CONTAINER.pooler,
    'psql',
    '-h',
    POOLER_SOCKET_DIR,
    '-p',
    String(POOLER_PORT),
    '-U',
    'pgbouncer',
    '-d',
    'pgbouncer',
    '--csv',
    '-c',
    'SHOW POOLS',
  ]);
  if (done.code !== 0) return null;
  const [header, ...rows] = done.stdout.trim().split('\n');
  if (!header) return null;
  const columns = header.split(',');
  const at = (name: string) => columns.indexOf(name);
  for (const need of ['database', 'cl_active', 'cl_waiting', 'sv_active', 'sv_idle'])
    if (at(need) < 0) return null;
  return rows
    .map((row) => row.split(','))
    .filter((cells) => cells[at('database')] !== 'pgbouncer')
    .map((cells) => ({
      database: cells[at('database')] as string,
      clientsActive: Number(cells[at('cl_active')]),
      clientsWaiting: Number(cells[at('cl_waiting')]),
      serversActive: Number(cells[at('sv_active')]),
      serversIdle: Number(cells[at('sv_idle')]),
    }));
}
