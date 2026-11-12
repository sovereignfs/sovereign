import { secretsOf, variablePrefix, type SignIn } from '@sovereignfs/manifest';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Failed, Refused } from '../errors.js';
import { readManifest } from '../manifest.js';
import { Registry } from '../registry.js';
import { appRoleLimit } from '../suite/connections.js';
import { appEnvProblems } from '../suite/apps.js';
import type { Problem } from '../suite/schema.js';
import {
  hasDatabase,
  isExternal,
  type ExternalApp,
  type HostedApp,
  type Lock,
  type Manifest,
  type Suite,
} from '../suite/types.js';
import {
  composeUp,
  docker,
  ensureDatabase,
  ensureNetwork,
  ensureOnNetwork,
  psql,
} from './docker.js';
import type { Host } from './host.js';
import { CONTAINER, NETWORK, POOLER_PORT, PROJECT } from './names.js';
import { appCompose, appOrigin, byDigest, keepsFiles, type ImageOverrides } from './render.js';
import { ensureFilesFolder, imageUser, removeFilesFolder } from './files.js';
import type { GeneratedSecrets } from './secrets.js';
import type { State } from './state.js';
import { appDatabaseOf, isAppSecretFile } from './scope.js';

/** The names an app is given in the database server: one role and one database, which only that role may open. */
export const databaseOf = appDatabaseOf;

/** Reads the manifest of every hosted app, as the lock pins it, and refuses the apps whose manifest cannot be used (operator-cli §6.5). */
export async function readManifests(
  host: Host,
  suite: Suite,
  lock: Lock,
): Promise<{ manifests: Record<string, Manifest>; problems: Problem[] }> {
  const registry = host.registry ?? new Registry(host.fetch);
  const manifests: Record<string, Manifest> = {};
  const problems: Problem[] = [];
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (isExternal(app)) continue;
    try {
      manifests[name] = await readManifest(
        name,
        app,
        registry,
        suite.core.version,
        host.fetch,
        lock.apps?.[name]?.digest,
      );
      problems.push(...appEnvProblems(name, app, manifests[name] as Manifest));
    } catch (error) {
      if (error instanceof Refused) problems.push({ at: `apps.${name}`, message: error.message });
      else throw error;
    }
  }
  return { manifests, problems };
}

const absolute = (suite: Suite, name: string, pathOrUrl: string) =>
  pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('http://')
    ? pathOrUrl
    : `${appOrigin(suite, name)}${pathOrUrl}`;

/** What `sovereign-admin apps ensure` is asked for a hosted app: everything from its manifest and its name, and nothing the operator typed but the launcher (contracts/suite.md §1.7). */
export function hostedClient(
  suite: Suite,
  name: string,
  app: HostedApp,
  manifest: Manifest,
): string[] {
  const signIn: SignIn | undefined = manifest.signIn;
  // Only an app that signs people in through core has a client to register (contracts/app-manifest.md §2.3).
  if (!signIn) throw new Error(`${name} has no signIn, so it has no client.`);
  const launcher = app.launcher ?? {};
  const launchUrl = launcher.launchUrl ?? absolute(suite, name, manifest.launch ?? '/');
  const description = launcher.description ?? manifest.description;
  const icon = launcher.icon ?? (manifest.icon ? absolute(suite, name, manifest.icon) : undefined);
  return [
    '--name',
    manifest.name,
    '--redirect',
    ...signIn.redirect.map((p) => absolute(suite, name, p)),
    ...(signIn.postLogout?.length
      ? ['--post-logout', ...signIn.postLogout.map((p) => absolute(suite, name, p))]
      : []),
    ...(signIn.backChannel ? ['--back-channel', absolute(suite, name, signIn.backChannel)] : []),
    ...(signIn.accountDeleted
      ? ['--account-deleted', absolute(suite, name, signIn.accountDeleted)]
      : []),
    '--scope',
    ...signIn.scopes,
    // A hosted app is the operator's own: people are not asked about it, and it may ask for roles (contracts/app-manifest.md §2.1).
    '--trusted',
    '--launch-url',
    launchUrl,
    ...(description ? ['--description', description] : []),
    ...(icon ? ['--icon', icon] : []),
    ...(launcher.show === false ? ['--hide'] : []),
  ];
}

/** The same for an external app: what the operator wrote, and nothing it was not told. */
export function externalClient(app: ExternalApp): string[] {
  const launcher = app.launcher ?? {};
  return [
    '--name',
    app.name,
    '--redirect',
    ...app.redirect,
    ...(app.postLogout?.length ? ['--post-logout', ...app.postLogout] : []),
    ...(app.backChannel ? ['--back-channel', app.backChannel] : []),
    ...(app.scopes?.length ? ['--scope', ...app.scopes] : []),
    ...(app.type === 'public' ? ['--public'] : []),
    ...(app.trusted ? ['--trusted'] : []),
    ...(launcher.launchUrl ? ['--launch-url', launcher.launchUrl] : []),
    ...(launcher.description ? ['--description', launcher.description] : []),
    ...(launcher.icon ? ['--icon', launcher.icon] : []),
    ...(launcher.show === false ? ['--hide'] : []),
  ];
}

const clientSecretFile = (name: string) => `app-${name}-client-secret`;

const lastLine = (text: string) => text.trim().split('\n').pop() ?? '';

/**
 * Makes the app's client at core, or finds it (operator-cli §6.1 step 6). Core returns a client secret once, so it is written to
 * `secrets/` before anything else is done with it; and a confidential client that exists with no such file (a run stopped between
 * the two) is given a new secret and not left without one.
 */
export async function ensureClient(
  host: Host,
  generated: GeneratedSecrets,
  name: string,
  args: string[],
  confidential: boolean,
): Promise<{ clientId: string; created: boolean }> {
  const done = await docker(host, `Registering ${name} with core`, [
    'exec',
    CONTAINER.core,
    'sovereign-admin',
    'apps',
    'ensure',
    name,
    ...args,
    '--json',
  ]);
  let parsed: { clientId?: string; secret?: string };
  try {
    parsed = JSON.parse(lastLine(done.stdout)) as { clientId?: string; secret?: string };
  } catch {
    throw new Failed(`Core gave no client for ${name}.`, 'Look at sv logs core.');
  }
  if (!parsed.clientId) throw new Failed(`Core gave no client ID for ${name}.`);
  let created = false;
  if (parsed.secret) {
    await generated.write(clientSecretFile(name), parsed.secret);
    created = true;
  } else if (confidential && (await generated.read(clientSecretFile(name))) === undefined) {
    const rotated = await docker(host, `Giving ${name} a new client secret`, [
      'exec',
      CONTAINER.core,
      'sovereign-admin',
      'apps',
      'rotate-secret',
      name,
      '--json',
    ]);
    const secret = (JSON.parse(lastLine(rotated.stdout)) as { secret?: string }).secret;
    if (!secret) throw new Failed(`Core gave no new secret for ${name}.`);
    await generated.write(clientSecretFile(name), secret);
    created = true;
  }
  return { clientId: parsed.clientId, created };
}

export type AppRun = {
  host: Host;
  suite: Suite;
  lock: Lock;
  release: string;
  stateDir: string;
  generated: GeneratedSecrets;
  internalCa: boolean;
  imageOverrides?: ImageOverrides;
  /** Every public name the proxy answers to, which it is an alias of on every network. */
  names: string[];
  /** Compose overrides for this app, if the operator wrote any. */
  overrideFiles: (name: string) => string[];
  operatorSecrets: Record<string, Record<string, string>>;
  /** Whether the app had a client at core when the last run ended, so one that no longer signs people in through core can have it removed. */
  hadClient: (name: string) => boolean;
  /** The apps that go through the pooler this run: those that declare it, when it is on (operator-cli §6.4.5). */
  pooled: ReadonlySet<string>;
};

export type AppResult = State['apps'][string] & {
  host?: string;
  container?: string;
  port?: number;
  /** Whether this run made something new for the app: its client secret, or its database. */
  created?: boolean;
};

/**
 * One hosted app (operator-cli §6.1 step 6): its network, its database and role, its client at core, its environment, its container and
 * its health check. The proxy entry is added by the caller once this has returned, so the proxy never points at an app that is not up.
 */
export async function applyHostedApp(
  run: AppRun,
  name: string,
  app: HostedApp,
  manifest: Manifest,
): Promise<AppResult> {
  const { host, suite, lock, generated } = run;
  const network = NETWORK.app(name);
  await ensureNetwork(host, network);
  await ensureOnNetwork(host, CONTAINER.database, network, []);
  await ensureOnNetwork(host, CONTAINER.proxy, network, run.names);

  const prefix = variablePrefix(manifest);
  const database = databaseOf(name);
  const pooled = run.pooled.has(name);
  const secrets: Record<string, string> = {};
  let postgres = false;
  if (hasDatabase(manifest)) {
    const password = await generated.ensure(`role-app-${name}-password`, () =>
      generated.random(24),
    );
    await ensureDatabase(
      host,
      database,
      database,
      password.value,
      appRoleLimit(suite, name, pooled),
    );
    const server = `postgres://${database}:${password.value}@${CONTAINER.database}:5432/${database}`;
    // Through the pooler only for an app that declared it can be, and only while it is on; otherwise the server itself.
    await generated.write(
      `app-${name}-postgres-url`,
      pooled
        ? `postgres://${database}:${password.value}@${CONTAINER.pooler}:${POOLER_PORT}/${database}`
        : server,
    );
    secrets[`${prefix}_POSTGRES_URL`] = `app-${name}-postgres-url`;
    // The server itself, for what needs a session. No pooler runs yet, so it is the same address (operator-cli §6.4.4).
    await generated.write(`app-${name}-postgres-direct-url`, server);
    secrets[`${prefix}_POSTGRES_DIRECT_URL`] = `app-${name}-postgres-direct-url`;
    postgres = true;
  }

  // Only an app that signs people in through core is a client there (contracts/app-manifest.md §2.3). One that has stopped is no longer.
  let clientId: string | undefined;
  let client: { clientId: string; created: boolean } | undefined;
  if (manifest.signIn) {
    client = await ensureClient(
      host,
      generated,
      name,
      hostedClient(suite, name, app, manifest),
      true,
    );
    clientId = client.clientId;
    secrets[`${prefix}_CORE_CLIENT_SECRET`] = clientSecretFile(name);
  } else if (run.hadClient(name)) {
    await removeClient(host, name);
  }

  for (const { name: variable, bytes } of secretsOf(manifest)) {
    await generated.ensure(`app-${name}-${variable}`, () => generated.random(bytes));
    secrets[variable] = `app-${name}-${variable}`;
  }
  for (const [variable, value] of Object.entries(run.operatorSecrets[name] ?? {})) {
    await generated.write(`app-${name}-op-${variable}`, value);
    secrets[variable] = `app-${name}-op-${variable}`;
  }

  const image =
    run.imageOverrides?.apps?.[name] ??
    byDigest(lock.apps?.[name] as { ref: string; digest: string });
  // The app's folder of people's files (RFC 0004 §6): made before it is mounted, owned by the user the app runs as, with a key the app
  // signs download addresses with. The folder is made from core's image, which has a shell.
  if (keepsFiles(manifest)) {
    const variable = `${prefix}_STORAGE_SIGNING_KEY`;
    await generated.ensure(`app-${name}-${variable}`, () => generated.random(48));
    secrets[variable] = `app-${name}-${variable}`;
    const helper = run.imageOverrides?.core ?? byDigest(lock.images.core);
    await ensureFilesFolder(host, helper, name, await imageUser(host, image));
  }
  const composeFile = path.join(run.release, 'apps', name, 'compose.yml');
  await mkdir(path.dirname(composeFile), { recursive: true });
  await writeFile(
    composeFile,
    appCompose({
      name,
      suite,
      image,
      manifest,
      clientId,
      stateDir: run.stateDir,
      secrets,
      internalCa: run.internalCa,
      pooled,
    }),
  );
  await composeUp(host, {
    project: PROJECT.app(name),
    files: [composeFile, ...run.overrideFiles(name)],
    waitSeconds: 60,
    wait: false,
  });
  await waitHealthy(host, name, manifest);
  return {
    kind: 'hosted',
    ...(clientId === undefined ? {} : { clientId }),
    ...(client ? { created: client.created } : {}),
    ...(postgres ? { database, role: database } : {}),
    version: app.image,
    healthy: true,
    host: `${name}.${suite.domain}`,
    container: CONTAINER.app(name),
    port: manifest.port,
  };
}

/** An external app gets its client and nothing else (operator-cli §6.1 step 6). */
export async function applyExternalApp(
  run: AppRun,
  name: string,
  app: ExternalApp,
): Promise<AppResult> {
  const client = await ensureClient(
    run.host,
    run.generated,
    name,
    externalClient(app),
    app.type !== 'public',
  );
  return { kind: 'external', clientId: client.clientId, created: client.created };
}

/** Waits for the app to answer its health path, asked from the proxy, which is on its network (contracts/app-manifest.md §2). */
async function waitHealthy(host: Host, name: string, manifest: Manifest): Promise<void> {
  const url = `http://${CONTAINER.app(name)}:${manifest.port}${manifest.health}`;
  let last = '';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const done = await host.docker([
      'exec',
      CONTAINER.proxy,
      'wget',
      '-q',
      '-O',
      '/dev/null',
      '-T',
      '5',
      url,
    ]);
    if (done.code === 0) return;
    last = (done.stderr || done.stdout).trim().split('\n').pop() ?? '';
    await host.sleep(2000);
  }
  throw new Failed(
    `${name} did not answer ${manifest.health} in two minutes${last ? ` (${last})` : ''}.`,
    `sv logs ${name} shows what it printed.`,
  );
}

/** Removes an app's client at core, and its launcher entry with it. An app that has none is not an error. */
async function removeClient(host: Host, name: string): Promise<void> {
  const removed = await host.docker([
    'exec',
    CONTAINER.core,
    'sovereign-admin',
    'apps',
    'remove',
    name,
  ]);
  if (removed.code !== 0 && !/no app|not found|no such/i.test(removed.stderr + removed.stdout)) {
    throw new Failed(
      `Removing ${name}’s client failed: ${(removed.stderr || removed.stdout).trim().split('\n').pop()}`,
    );
  }
}

/**
 * An app in `state.json` that is no longer in `suite.yml` (operator-cli §6.1 step 7): its container is stopped and removed and its client
 * is removed at core. Its database, role, data and generated secrets stay, so adding it again picks up where it was.
 */
export async function removeApp(host: Host, name: string): Promise<void> {
  await host.docker(['rm', '--force', CONTAINER.app(name)]);
  await removeClient(host, name);
  for (const container of [CONTAINER.proxy, CONTAINER.database]) {
    await host.docker(['network', 'disconnect', NETWORK.app(name), container]);
  }
  await host.docker(['network', 'rm', NETWORK.app(name)]);
}

/** What a purge deletes (operator-cli §6.2): the app's database and role, its data volumes and its generated secrets. The caller has backed it up. */
export async function purgeApp(
  host: Host,
  generated: GeneratedSecrets,
  name: string,
  /** An image with a shell, to delete the app's folder of people's files with: core's. */
  helperImage: string,
): Promise<void> {
  await host.docker(['rm', '--force', CONTAINER.app(name)]);
  await removeFilesFolder(host, helperImage, name);
  const volumes = await host.docker([
    'volume',
    'ls',
    '--quiet',
    '--filter',
    `label=com.docker.compose.project=${PROJECT.app(name)}`,
  ]);
  for (const volume of volumes.stdout.split('\n').filter(Boolean))
    await docker(host, `Deleting ${name}’s data`, ['volume', 'rm', volume]);
  const database = databaseOf(name);
  if ((await host.docker(['inspect', CONTAINER.database])).code === 0) {
    await psql(
      host,
      `Deleting ${name}’s database`,
      `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);\nDROP ROLE IF EXISTS "${database}";\n`,
    );
  }
  for (const file of await readdir(generated.dir)) {
    if (isAppSecretFile(name, file)) {
      await rm(generated.pathOf(file), { force: true });
    }
  }
}
