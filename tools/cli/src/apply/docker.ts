import { Failed } from '../errors.js';
import type { Host, Ran } from './host.js';
import { CONTAINER, DATABASE_ADMIN } from './names.js';

/** Runs docker and fails, with what docker said, unless it succeeds. `what` says what was being done. */
export async function docker(
  host: Host,
  what: string,
  args: readonly string[],
  options?: Parameters<Host['docker']>[1],
): Promise<Ran> {
  const done = await host.docker(args, options);
  if (done.code !== 0) {
    throw new Failed(
      `${what} failed: ${(done.stderr || done.stdout).trim().split('\n').slice(-4).join(' ')}`,
      'Fix what docker says, then run sv deploy again: it carries on from here.',
    );
  }
  return done;
}

/** The versions of Docker and its Compose plugin, or nothing for one that is not there. */
export async function dockerVersions(host: Host): Promise<{ engine?: string; compose?: string }> {
  const engine = await host.docker(['version', '--format', '{{.Server.Version}}']);
  const compose = await host.docker(['compose', 'version', '--short']);
  return {
    ...(engine.code === 0 ? { engine: engine.stdout.trim() } : {}),
    ...(compose.code === 0 ? { compose: compose.stdout.trim().replace(/^v/, '') } : {}),
  };
}

export async function ensureNetwork(host: Host, name: string): Promise<void> {
  const found = await host.docker(['network', 'inspect', name]);
  if (found.code === 0) return;
  await docker(host, `Making the network ${name}`, [
    'network',
    'create',
    '--label',
    'io.github.sovereignfs.managed=true',
    name,
  ]);
}

export type ComposeUp = {
  project: string;
  /** The compose file first, then any overrides, which are applied last. */
  files: string[];
  waitSeconds?: number;
  /** Wait for the services' health checks. Off for an app, whose health is asked of it by the path its manifest names. */
  wait?: boolean;
};

/**
 * Starts a project and waits for it to be healthy. Compose changes only what differs from what is running, so a project whose
 * configuration is the same is left alone: that is what lets a second deployment change nothing.
 */
export async function composeUp(host: Host, up: ComposeUp): Promise<void> {
  await docker(host, `Starting ${up.project}`, [
    'compose',
    '--project-name',
    up.project,
    ...up.files.flatMap((file) => ['-f', file]),
    'up',
    '--detach',
    '--remove-orphans',
    ...(up.wait === false ? [] : ['--wait', '--wait-timeout', String(up.waitSeconds ?? 180)]),
  ]);
}

export async function composeDown(host: Host, project: string, files: string[]): Promise<void> {
  await docker(host, `Stopping ${project}`, [
    'compose',
    '--project-name',
    project,
    ...files.flatMap((file) => ['-f', file]),
    'down',
    '--remove-orphans',
  ]);
}

type Inspected = { NetworkSettings?: { Networks?: Record<string, { Aliases?: string[] | null }> } };

/**
 * Puts a container on a network under the given aliases, and no others of ours (operator-cli §6.4). Done when the container is
 * already there with them; changing an alias set means leaving the network and joining it again.
 */
export async function ensureOnNetwork(
  host: Host,
  container: string,
  network: string,
  aliases: readonly string[],
): Promise<void> {
  const found = await host.docker(['inspect', container]);
  if (found.code !== 0) throw new Failed(`${container} is not there to put on ${network}.`);
  const networks = (JSON.parse(found.stdout) as Inspected[])[0]?.NetworkSettings?.Networks ?? {};
  const current = networks[network];
  if (current) {
    const have = new Set(current.Aliases ?? []);
    if (aliases.every((alias) => have.has(alias))) return;
    await docker(host, `Leaving ${network}`, ['network', 'disconnect', network, container]);
  }
  await docker(host, `Joining ${network}`, [
    'network',
    'connect',
    ...aliases.flatMap((alias) => ['--alias', alias]),
    network,
    container,
  ]);
}

/** Runs SQL as the database administrator. The SQL is written to psql’s standard input, where it is not in a process list. */
export async function psql(
  host: Host,
  what: string,
  sql: string,
  database = 'postgres',
): Promise<string> {
  const done = await docker(
    host,
    what,
    [
      'exec',
      '-i',
      CONTAINER.database,
      'psql',
      '-U',
      DATABASE_ADMIN,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-t',
      '-A',
    ],
    { input: sql },
  );
  return done.stdout.trim();
}

/** Makes a role and a database it owns, and no one else can connect to (operator-cli §6.4). Safe to run again, and sets the password each time. */
export async function ensureDatabase(
  host: Host,
  name: string,
  role: string,
  password: string,
  /** The most connections the role may hold (operator-cli §6.4.4). It applies to the next connection and ends none. */
  connectionLimit: number,
): Promise<void> {
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1)
    throw new Error(`${connectionLimit} is not a connection limit`);
  const quoted = `'${password.replace(/'/g, "''")}'`;
  await psql(
    host,
    `Making the database ${name}`,
    `DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
    CREATE ROLE "${role}" LOGIN PASSWORD ${quoted};
  ELSE
    ALTER ROLE "${role}" PASSWORD ${quoted};
  END IF;
END $$;
ALTER ROLE "${role}" CONNECTION LIMIT ${connectionLimit};
SELECT 'CREATE DATABASE "${name}" OWNER "${role}"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${name}')\\gexec
REVOKE ALL ON DATABASE "${name}" FROM PUBLIC;
GRANT CONNECT ON DATABASE "${name}" TO "${role}";
`,
  );
}
