import { existsSync } from 'node:fs';
import {
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { Failed, Refused, SvError } from '../errors.js';
import { SecretsFile, decryptValue } from '../secrets/store.js';
import { SuiteFile, readLock, writeAtomically } from '../suite/files.js';
import {
  DEFAULT_MAX_CONNECTIONS,
  connectionBudget,
  corePool,
  describeBudget,
  maxConnectionsOf,
  roleLimit,
} from '../suite/connections.js';
import { lockProblems } from '../suite/lock.js';
import type { Problem } from '../suite/schema.js';
import { isExternal, type Manifest, type Suite } from '../suite/types.js';
import {
  applyExternalApp,
  applyHostedApp,
  purgeApp,
  readManifests,
  removeApp,
  type AppResult,
  type AppRun,
} from './apps.js';
import { takeBackup } from './backup.js';
import {
  BACKUP,
  loadDatabases,
  markRestored,
  restoreSecrets,
  restoreVolumes,
  saveDeletions,
  stopRunning,
} from './restore.js';
import { look, refusals, refuseIfAny } from './checks.js';
import { composeUp, docker, ensureDatabase, ensureNetwork, ensureOnNetwork } from './docker.js';
import type { Host } from './host.js';
import { withLock } from './lock.js';
import { CONTAINER, CORE_DATABASE, CORE_ROLE, NETWORK, PROJECT } from './names.js';
import {
  GENERATED_FOR_CORE,
  byDigest,
  caddyfile,
  coreCompose,
  databaseCompose,
  mailCompose,
  proxyCompose,
  publicNames,
  type BaseInput,
  type ImageOverrides,
} from './render.js';
import { usesMailpit } from '../suite/environment.js';
import { GeneratedSecrets } from './secrets.js';
import { layout, readState, writeState, type State } from './state.js';

export type ApplyOptions = {
  /** A folder holding the files of one commit: suite.yml, suite.lock, secrets.age.yml and overrides/. */
  from: string;
  /** The commit they are from; it names the release directory. */
  commit: string;
  stateDir: string;
  /** Whether the proxy publishes ports 80 and 443. Always, except in a test that shares a machine. */
  publishPorts: boolean;
  skipDns: boolean;
  /** Set by a restore, which may take core’s version backward. */
  restore: boolean;
  /** A backup unpacked in a folder: the instance is brought to the commit and then its data is put back (operator-cli §10.2). */
  restoreFrom?: string;
  /** The image this run is in, written down so the server’s wrapper starts the next request from it. */
  toolkitImage?: string;
  /** For tests that run a locally built image. Nothing in the toolkit sets it, and no command line flag reaches it. */
  imageOverrides?: ImageOverrides;
};

export type ApplyResult = { changed: boolean; release: string; steps: string[] };

const KEEP_RELEASES = 5;

/**
 * `sv apply` (operator-cli §6): makes the server match one commit, by the steps of §6.1 in order, each doing nothing when its result is
 * already true. A step that fails stops the run and names what to do; nothing after it has happened and `current` has not moved, so running
 * it again carries on.
 */
export async function apply(host: Host, options: ApplyOptions): Promise<ApplyResult> {
  if (!/^[0-9a-f]{7,64}$/.test(options.commit)) {
    throw new Refused(
      `${options.commit} is not a commit.`,
      'Pass the commit’s hash with --commit.',
    );
  }
  const paths = layout(options.stateDir);
  await mkdir(options.stateDir, { recursive: true, mode: 0o755 });
  for (const dir of [paths.secrets, paths.backups])
    await mkdir(dir, { recursive: true, mode: 0o700 });
  return withLock(paths.lock, host, () => run(host, options));
}

async function run(host: Host, options: ApplyOptions): Promise<ApplyResult> {
  const paths = layout(options.stateDir);
  const steps: string[] = [];
  const say = (line: string) => {
    steps.push(line);
    host.log(line);
  };

  // 1. Check.
  const file = await SuiteFile.load(options.from);
  const suite = file.value;
  const lock = await readLock(options.from);
  if (!lock)
    throw new Refused('There is no suite.lock in this commit.', 'Run sv push; it needs one.');
  const stale = lockProblems(suite, lock);
  refuseIfAny('suite.lock does not match suite.yml:', stale);
  const secrets = (await SecretsFile.load(options.from)).value;
  const overrides = await readOverrides(options.from, Object.keys(suite.apps ?? {}));
  const state = await readState(options.stateDir);
  const read = await readManifests(host, suite, lock);
  // The connections the limits allow (operator-cli §6.4.4): a refusal when the operator set them, a warning when they left them be.
  const budget = connectionBudget(suite, (name) => read.manifests[name]?.database === true);
  const budgetProblems: Problem[] = [];
  if (budget.exceeded) {
    const said = `${describeBudget(budget, maxConnectionsOf(suite))} Raise database.maxConnections or lower connections.`;
    if (budget.explicit) budgetProblems.push({ at: 'database', message: said });
    else host.log(`Warning: ${said}`);
  }
  refuseIfAny('sv apply will not run:', [
    ...refusals({
      suite,
      state,
      secrets,
      coreOverride: overrides.compose.core,
      restore: options.restore || options.restoreFrom !== undefined,
    }),
    ...overrides.problems,
    ...read.problems,
    ...budgetProblems,
  ]);
  const manifests = read.manifests;
  say('Checked suite.yml, suite.lock, the manifests and the overrides.');

  // 2. Look.
  const names = publicNames(suite);
  const everyName = [names.core, ...Object.values(names.apps)];
  const looked = await look({
    host,
    suite,
    stateDir: options.stateDir,
    skipDns: options.skipDns,
    publicNames: everyName,
  });
  for (const warning of looked.warnings) host.log(`Warning: ${warning}`);
  refuseIfAny('The machine is not ready:', looked.problems);
  say('Docker, disk space and DNS are as they should be.');

  const before = await fingerprint(host, Object.keys(names.apps));
  const generated = new GeneratedSecrets(paths.secrets, host);

  // A restore (operator-cli §10.2) first stops what runs and keeps what must survive it: a copy of what is there now, and the people deleted
  // since the backup. The backup’s secrets go in before any is made, since the passwords in its dump are the ones they hold.
  let deletions: string | undefined;
  if (options.restoreFrom) {
    if ((await containerId(host, CONTAINER.database)) !== undefined) {
      const archive = await takeBackup(host, {
        stateDir: options.stateDir,
        recipients: suite.secrets.recipients,
        reason: 'before-restore',
        ...(options.toolkitImage ? { image: options.toolkitImage } : {}),
      });
      say(`Backed up what is there now to ${archive}, before it is replaced.`);
    }
    deletions = await saveDeletions(host, options.stateDir);
    if (!deletions)
      say(
        'Core could not be reached to list its deletions: people deleted since the backup was taken will reappear.',
      );
    await stopRunning(host);
    const count = await restoreSecrets(options.restoreFrom, paths.secrets);
    say(
      `Stopped core and the apps, and put back ${count} secret${count === 1 ? '' : 's'} from the backup.`,
    );
  }

  // 3. Back up, when core or the database server changes version, or an app’s data is about to be deleted.
  if (
    state &&
    (state.core.version !== suite.core.version || state.database.version !== suite.database.version)
  ) {
    const archive = await takeBackup(host, {
      stateDir: options.stateDir,
      recipients: suite.secrets.recipients,
      reason: 'before-change',
      ...(options.toolkitImage ? { image: options.toolkitImage } : {}),
    });
    say(`Backed up to ${archive}, because core or the database server is changing version.`);
  }
  const purging = suite.purge ?? [];
  if (purging.length > 0 && (await containerId(host, CONTAINER.database)) !== undefined) {
    const archive = await takeBackup(host, {
      stateDir: options.stateDir,
      recipients: suite.secrets.recipients,
      reason: 'before-purge',
      ...(options.toolkitImage ? { image: options.toolkitImage } : {}),
    });
    say(
      `Backed up to ${archive}, because ${purging.join(', ')} ${purging.length === 1 ? 'is' : 'are'} to be purged.`,
    );
  }

  // 4. Render.
  const internalCa = suite.tls?.mode === 'internal';
  const operatorSecrets = await decryptOperatorSecrets(options, secrets);
  const coreSecretNames = [
    ...Object.keys(GENERATED_FOR_CORE),
    ...Object.keys(operatorSecrets.core ?? {}),
  ];
  const input: BaseInput = {
    ...(options.imageOverrides ? { imageOverrides: options.imageOverrides } : {}),
    suite,
    lock,
    stateDir: options.stateDir,
    publishPorts: options.publishPorts,
    coreSecrets: coreSecretNames,
    internalCa,
    names: everyName,
  };
  const release = path.join(paths.releases, options.commit);
  await renderRelease(release, options, input, overrides);
  // Until each app has been looked at again, the proxy keeps answering for those that were up, so a deployment does not interrupt them.
  const served = Object.entries(suite.apps ?? {}).flatMap(([name, app]) => {
    const manifest = manifests[name];
    return !isExternal(app) && manifest && state?.apps[name]?.healthy
      ? [{ host: names.apps[name] as string, container: CONTAINER.app(name), port: manifest.port }]
      : [];
  });
  let caddyChanged = await writeProxyFiles(paths.proxy, suite, overrides, served);
  say(`Rendered release ${options.commit}.`);

  // 5. Start the base.
  if (internalCa) await mkdir(paths.pki, { recursive: true, mode: 0o755 });
  await ensureNetwork(host, NETWORK.core);
  await generated.ensure('postgres-admin-password', () => generated.random(24));
  const rolePassword = await generated.ensure('role-core-password', () => generated.random(24));
  await generated.ensure('SV_AUTH_SECRET', () => generated.random(48));
  await generated.ensure(
    'SV_FIELD_ENCRYPTION_KEYS',
    () => `k1:${host.random(32).toString('base64url')}`,
  );
  await generated.write(
    'SV_POSTGRES_URL',
    `postgres://${CORE_ROLE}:${rolePassword.value}@${CONTAINER.database}:5432/${CORE_DATABASE}`,
  );
  for (const [name, value] of Object.entries(operatorSecrets.core ?? {}))
    await generated.write(name, value);
  await forgetRemovedOperatorSecrets(generated, state, operatorSecrets);

  // A different max_connections is a restart of the database server, which core and the apps reconnect from.
  const appliedMax = state?.database.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  if (state && appliedMax !== maxConnectionsOf(suite))
    say(
      `max_connections changes from ${appliedMax} to ${maxConnectionsOf(suite)}: the database server restarts, and core and the apps reconnect.`,
    );
  await composeUp(host, {
    project: PROJECT.database,
    files: [path.join(release, 'database', 'compose.yml'), ...(overrides.files.database ?? [])],
  });
  if (options.restoreFrom) {
    await loadDatabases(host, path.join(options.restoreFrom, BACKUP.databases));
    const volumes = await restoreVolumes(host, options.restoreFrom, options.toolkitImage);
    say(`The databases and ${volumes} data volume${volumes === 1 ? '' : 's'} are back.`);
  }
  await ensureDatabase(
    host,
    CORE_DATABASE,
    CORE_ROLE,
    rolePassword.value,
    roleLimit(corePool(suite)),
  );
  say('The database server is up, with core’s database.');
  if (options.restoreFrom) {
    await markRestored(host, path.join(release, 'core', 'compose.yml'), deletions);
    say('Recorded the restore: every session and token from before it is ended.');
  }

  const proxyBefore = await containerId(host, CONTAINER.proxy);
  await composeUp(host, {
    project: PROJECT.proxy,
    files: [path.join(release, 'proxy', 'compose.yml'), ...(overrides.files.proxy ?? [])],
  });
  await ensureOnNetwork(host, CONTAINER.proxy, NETWORK.core, everyName);
  // A proxy that was already running and is still the same one is told to read its configuration again; a new one has just read it.
  const reload = async () => {
    // The proxy reads the file through a mount, which on some machines shows a replaced file a moment late; it is told to read it
    // only once it sees what was written.
    const wanted = await readFile(path.join(paths.proxy, 'Caddyfile'), 'utf8');
    for (let attempt = 0; ; attempt += 1) {
      const seen = await host.docker(['exec', CONTAINER.proxy, 'cat', '/etc/caddy/Caddyfile']);
      if (seen.code === 0 && seen.stdout === wanted) break;
      if (attempt === 29)
        throw new Failed(
          'The proxy does not see the configuration that was written for it.',
          'Look at sv logs proxy, then run sv deploy again: it carries on from here.',
        );
      await host.sleep(1000);
    }
    await docker(host, 'Reloading the proxy', [
      'exec',
      CONTAINER.proxy,
      'caddy',
      'reload',
      '--config',
      '/etc/caddy/Caddyfile',
    ]);
  };
  if (
    caddyChanged &&
    proxyBefore !== undefined &&
    proxyBefore === (await containerId(host, CONTAINER.proxy))
  ) {
    await reload();
    caddyChanged = false;
  }
  if (internalCa) await fetchCertificateAuthority(host, paths.pki);
  say('The proxy is up.');

  // Mailpit, on a development or staging instance, is up before core, so that the first mail core sends has somewhere to go.
  if (usesMailpit(suite)) {
    await composeUp(host, {
      project: PROJECT.mail,
      files: [path.join(release, 'mail', 'compose.yml')],
    });
    say('Mailpit is up: mail from core is kept in its inbox, which sv mail opens.');
  } else if ((await containerId(host, CONTAINER.mail)) !== undefined) {
    await docker(host, 'Removing Mailpit', ['rm', '--force', CONTAINER.mail]);
    say(
      'Mailpit is removed, since this instance sends mail on its own. What it kept stays in its volume.',
    );
  }

  await composeUp(host, {
    project: PROJECT.core,
    files: [path.join(release, 'core', 'compose.yml'), ...(overrides.files.core ?? [])],
  });
  say(`Core ${suite.core.version} is up and healthy.`);

  // 6. Each app, in the order of suite.yml. One that fails does not stop the others (operator-cli §6.3).
  const appRun: AppRun = {
    host,
    suite,
    lock,
    release,
    stateDir: options.stateDir,
    generated,
    internalCa,
    names: everyName,
    ...(options.imageOverrides ? { imageOverrides: options.imageOverrides } : {}),
    overrideFiles: (name) => overrides.files[name] ?? [],
    operatorSecrets,
  };
  const results: Record<string, AppResult> = {};
  const failures: { name: string; message: string }[] = [];
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    try {
      results[name] = isExternal(app)
        ? await applyExternalApp(appRun, name, app)
        : await applyHostedApp(appRun, name, app, manifests[name] as Manifest);
      say(
        isExternal(app)
          ? `${name} has its sign-in.`
          : `${name} is up at https://${names.apps[name]}.`,
      );
    } catch (error) {
      if (!(error instanceof SvError)) throw error;
      failures.push({ name, message: error.message });
      host.log(`${name} failed: ${error.message}`);
    }
  }
  // The proxy answers for an app only once it is up.
  const upstreams = Object.values(results).flatMap((result) =>
    result.host
      ? [{ host: result.host, container: result.container as string, port: result.port as number }]
      : [],
  );
  const changedNow = await writeProxyFiles(paths.proxy, suite, overrides, upstreams);
  if (caddyChanged || changedNow) {
    await reload();
    caddyChanged = true;
  }

  // 7. Apps that were running and are no longer in suite.yml, and the data of those to be purged.
  // Found by what is running as well as by state.json, which an app that never came up is not in.
  const running = await docker(host, 'Listing the apps that are running', [
    'ps',
    '--all',
    '--filter',
    'name=^sv-app-',
    '--format',
    '{{.Names}}',
  ]);
  const gone = new Set([
    ...Object.keys(state?.apps ?? {}),
    ...running.stdout
      .split('\n')
      .filter((line) => line.startsWith('sv-app-'))
      .map((line) => line.slice('sv-app-'.length)),
  ]);
  for (const name of gone) {
    if (name in (suite.apps ?? {})) continue;
    await removeApp(host, name);
    say(`${name} is stopped and no longer registered; its data stays.`);
  }
  for (const name of purging) {
    await purgeApp(host, generated, name);
    say(`${name}’s database, data and secrets are deleted.`);
  }

  if (failures.length > 0) {
    throw new Failed(
      `${failures.length === 1 ? 'One app' : `${failures.length} apps`} did not start: ${failures
        .map((failure) => `${failure.name} (${failure.message})`)
        .join('; ')}. Core and the other apps are running.`,
      'Fix what is named, then run sv deploy again: it carries on from here.',
    );
  }

  // 8. Verify.
  await verify(host, names, {
    hosted: Object.keys(results).filter((name) => results[name]?.kind === 'hosted'),
    cliImage: options.imageOverrides?.cli ?? byDigest(lock.images.cli),
    internalCa,
    pki: paths.pki,
  });
  say('Every public name answers over https, from inside core and from inside each app.');

  // 9. Record.
  await point(paths.current, release);
  const apps: State['apps'] = {};
  for (const [name, result] of Object.entries(results)) {
    const {
      host: _host,
      container: _container,
      port: _port,
      created: _created,
      ...recorded
    } = result;
    apps[name] = recorded;
  }
  const next: State = {
    schema: 1,
    commit: options.commit,
    ...(state && state.commit !== options.commit
      ? { previous: state.commit }
      : state?.previous
        ? { previous: state.previous }
        : {}),
    appliedAt: new Date(host.now()).toISOString(),
    core: { version: suite.core.version, image: lock.images.core.digest, healthy: true },
    database: { version: suite.database.version, maxConnections: maxConnectionsOf(suite) },
    tls: suite.tls?.mode ?? 'per-host',
    apps,
    operatorSecrets: Object.fromEntries(
      Object.entries(operatorSecrets).map(([owner, values]) => [owner, Object.keys(values)]),
    ),
  };
  await writeState(options.stateDir, next);
  if (options.toolkitImage)
    await writeAtomically(
      path.join(options.stateDir, 'toolkit-image'),
      `${options.toolkitImage}\n`,
    );
  await pruneReleases(paths.releases, options.commit);
  const after = await fingerprint(host, Object.keys(names.apps));
  const changed =
    generated.created > 0 ||
    caddyChanged ||
    before !== after ||
    Object.values(results).some((result) => result.created) ||
    purging.length > 0 ||
    state === undefined;
  say(changed ? 'Done.' : 'Nothing needed changing.');
  return { changed, release, steps };
}

type Overrides = {
  /** The contents of each Compose override, by project: core, proxy, database, or a hosted app’s name. */
  compose: Record<string, string>;
  /** Their paths, relative to the commit and then to the release, which `docker compose` is given after the generated file. */
  files: Record<string, string[]>;
  caddy: Record<string, string>;
  problems: Problem[];
};

/** Reads `overrides/` (contracts/suite.md §5) and refuses what it must not do: publish a port, or change a network. */
async function readOverrides(from: string, appNames: string[]): Promise<Overrides> {
  const out: Overrides = { compose: {}, files: {}, caddy: {}, problems: [] };
  const valid = ['core', 'proxy', 'database', ...appNames];
  const composeDir = path.join(from, 'overrides', 'compose');
  if (existsSync(composeDir)) {
    for (const entry of await readdir(composeDir)) {
      const name = entry.replace(/\.ya?ml$/, '');
      if (!/\.ya?ml$/.test(entry)) continue;
      if (!valid.includes(name)) {
        out.problems.push({
          at: `overrides/compose/${entry}`,
          message:
            'is for something that is not core, the proxy, the database or an app in suite.yml',
        });
        continue;
      }
      const text = await readFile(path.join(composeDir, entry), 'utf8');
      out.compose[name] = text;
      out.files[name] = [path.join('overrides', 'compose', entry)];
      const document = parse(text) as {
        services?: Record<string, Record<string, unknown>>;
        networks?: unknown;
      } | null;
      if (document?.networks)
        out.problems.push({
          at: `overrides/compose/${entry}`,
          message: 'changes a network, which an override may not do',
        });
      for (const service of Object.values(document?.services ?? {})) {
        if (service && 'ports' in service)
          out.problems.push({
            at: `overrides/compose/${entry}`,
            message: 'publishes a port, which an override may not do',
          });
        if (service && 'networks' in service)
          out.problems.push({
            at: `overrides/compose/${entry}`,
            message: 'changes a service’s networks, which an override may not do',
          });
      }
    }
  }
  const caddyDir = path.join(from, 'overrides', 'caddy');
  if (existsSync(caddyDir)) {
    for (const entry of await readdir(caddyDir)) {
      if (entry.endsWith('.caddy'))
        out.caddy[entry] = await readFile(path.join(caddyDir, entry), 'utf8');
    }
  }
  return out;
}

/** Decrypts the operator’s secrets with the server’s key (operator-cli §9.1). Written only to `secrets/`. */
async function decryptOperatorSecrets(
  options: ApplyOptions,
  secrets: Record<string, Record<string, string>>,
) {
  const owners = Object.entries(secrets).filter(([, names]) => Object.keys(names).length > 0);
  if (owners.length === 0) return {} as Record<string, Record<string, string>>;
  const keyFile = layout(options.stateDir).ageKey;
  if (!existsSync(keyFile)) {
    throw new Refused(
      'secrets.age.yml holds secrets and this server has no key to decrypt them with.',
      'Run sv server bootstrap, then sv secret rekey, push and deploy.',
    );
  }
  const identity = (await readFile(keyFile, 'utf8')).match(/AGE-SECRET-KEY-1\w+/)?.[0];
  if (!identity) throw new Refused(`${keyFile} holds no age key.`);
  const out: Record<string, Record<string, string>> = {};
  for (const [owner, names] of owners) {
    out[owner] = {};
    for (const [name, armored] of Object.entries(names)) {
      try {
        (out[owner] as Record<string, string>)[name] = await decryptValue(armored, identity);
      } catch {
        throw new Refused(
          `This server’s key cannot decrypt ${owner}’s ${name}.`,
          'Add the server’s key to secrets.recipients and run sv secret rekey, then push and deploy.',
        );
      }
    }
  }
  return out;
}

async function forgetRemovedOperatorSecrets(
  generated: GeneratedSecrets,
  state: State | undefined,
  now: Record<string, Record<string, string>>,
) {
  for (const name of state?.operatorSecrets?.core ?? []) {
    if (!(name in (now.core ?? {}))) await rm(generated.pathOf(name), { force: true });
  }
}

/** Writes the release directory: the commit’s own files, and everything generated from them (operator-cli §7). Nothing in it is a secret. */
async function renderRelease(
  release: string,
  options: ApplyOptions,
  input: BaseInput,
  overrides: Overrides,
): Promise<void> {
  await rm(release, { recursive: true, force: true });
  await mkdir(release, { recursive: true, mode: 0o755 });
  for (const name of ['suite.yml', 'suite.lock', 'secrets.age.yml']) {
    if (existsSync(path.join(options.from, name)))
      await cp(path.join(options.from, name), path.join(release, name));
  }
  if (existsSync(path.join(options.from, 'overrides'))) {
    await cp(path.join(options.from, 'overrides'), path.join(release, 'overrides'), {
      recursive: true,
    });
  }
  const projects = {
    core: coreCompose(input),
    proxy: proxyCompose(input),
    database: databaseCompose(input),
    ...(usesMailpit(input.suite) ? { mail: mailCompose(input) } : {}),
  };
  for (const [name, text] of Object.entries(projects)) {
    await mkdir(path.join(release, name), { recursive: true });
    await writeFile(path.join(release, name, 'compose.yml'), text);
  }
  // The overrides are read from the release, where the commit’s own copy of them is.
  for (const [name, files] of Object.entries(overrides.files)) {
    overrides.files[name] = files.map((file) => path.join(release, file));
  }
}

/** The proxy’s own files, at paths that do not change between deployments, so a deployment that changes nothing recreates nothing. */
async function writeProxyFiles(
  dir: string,
  suite: Suite,
  overrides: Overrides,
  apps: { host: string; container: string; port: number }[],
): Promise<boolean> {
  const names = publicNames(suite);
  const upstreams = [{ host: names.core, container: CONTAINER.core, port: 3000 }, ...apps];
  const text = caddyfile(suite, upstreams);
  await mkdir(path.join(dir, 'overrides'), { recursive: true });
  const target = path.join(dir, 'Caddyfile');
  const previous = existsSync(target) ? await readFile(target, 'utf8') : undefined;
  let changed = previous !== text;
  if (changed) await writeAtomically(target, text);
  const wanted = Object.keys(overrides.caddy);
  for (const entry of await readdir(path.join(dir, 'overrides'))) {
    if (!wanted.includes(entry)) {
      await rm(path.join(dir, 'overrides', entry), { force: true });
      changed = true;
    }
  }
  for (const [entry, body] of Object.entries(overrides.caddy)) {
    const file = path.join(dir, 'overrides', entry);
    if (!existsSync(file) || (await readFile(file, 'utf8')) !== body) {
      await writeFile(file, body);
      changed = true;
    }
  }
  return changed;
}

/** The proxy’s own authority’s certificate, put where core can be given it, so core trusts its own public name (`tls.mode: internal`). */
async function fetchCertificateAuthority(host: Host, pkiDir: string): Promise<void> {
  const inContainer = '/data/caddy/pki/authorities/local/root.crt';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await host.docker(['exec', CONTAINER.proxy, 'test', '-f', inContainer])).code === 0) break;
    if (attempt === 29)
      throw new Failed(
        'The proxy has not made its certificate authority.',
        'Look at sv logs proxy.',
      );
    await host.sleep(1000);
  }
  await mkdir(pkiDir, { recursive: true, mode: 0o755 });
  const fetched = path.join(pkiDir, `root.crt.${host.pid}.tmp`);
  await docker(host, 'Copying the proxy’s certificate authority', [
    'cp',
    `${CONTAINER.proxy}:${inContainer}`,
    fetched,
  ]);
  // Replaced only when it differs, so a deployment that changes nothing touches nothing that a container has open.
  const target = path.join(pkiDir, 'root.crt');
  const same =
    existsSync(target) && (await readFile(target, 'utf8')) === (await readFile(fetched, 'utf8'));
  if (same) await rm(fetched, { force: true });
  else {
    await chmod(fetched, 0o644);
    await rename(fetched, target);
  }
}

/** Fetches each address and fails on a certificate that does not verify or a name that does not resolve; any answer from a live app is enough. */
const FETCH_PEERS = `
(async () => {
  for (const url of process.argv.slice(1)) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if ([502, 503, 504].includes(response.status)) throw new Error(url + ' answered ' + response.status);
  }
})().catch((error) => { console.error((error.cause && error.cause.code) || error.message); process.exit(1); });`;

/**
 * Verifies the instance from the inside (operator-cli §6.1, step 8). From inside core: its public name answers over https with the
 * issuer it should, and so does each app’s. From inside each hosted app, as the app sees the network: every peer’s public name
 * answers, on a certificate that verifies. That is checked from a container that shares the app’s network and nothing else of it, since
 * the app’s own image may have nothing to ask with. Certificates are asked for on the first request, so each check tries for a while.
 */
async function verify(
  host: Host,
  names: ReturnType<typeof publicNames>,
  from: { hosted: string[]; cliImage: string; internalCa: boolean; pki: string },
): Promise<void> {
  const discovery = `
const origin = process.argv[1];
(async () => {
  const response = await fetch(origin + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('discovery answered ' + response.status);
  const issuer = (await response.json()).issuer;
  if (issuer !== origin) throw new Error('discovery names the issuer ' + issuer);
})().catch((error) => { console.error(error.message); process.exit(1); });`;
  const origin = `https://${names.core}`;
  const everyone = [origin, ...Object.values(names.apps).map((name) => `https://${name}`)];

  const tries = async (what: string, args: string[], hint: string) => {
    let last = '';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const done = await host.docker(args);
      if (done.code === 0) return;
      last = (done.stderr || done.stdout).trim().split('\n').pop() ?? '';
      await host.sleep(3000);
    }
    throw new Failed(`${what}: ${last}`, hint);
  };
  const hint = 'Check DNS and that ports 80 and 443 reach this server; sv doctor looks at both.';
  await tries(
    `${origin} did not answer from inside core`,
    ['exec', CONTAINER.core, 'node', '-e', discovery, origin],
    hint,
  );
  await tries(
    'A public name did not answer from inside core',
    ['exec', CONTAINER.core, 'node', '-e', FETCH_PEERS, ...everyone],
    hint,
  );
  for (const name of from.hosted) {
    await tries(
      `A public name did not answer from inside ${name}`,
      [
        'run',
        '--rm',
        '--network',
        `container:${CONTAINER.app(name)}`,
        '--entrypoint',
        'node',
        ...(from.internalCa
          ? ['--volume', `${from.pki}/root.crt:/ca.crt:ro`, '--env', 'NODE_EXTRA_CA_CERTS=/ca.crt']
          : []),
        from.cliImage,
        '-e',
        FETCH_PEERS,
        ...everyone,
      ],
      hint,
    );
  }
}

/** Points `current` at a release in one step, so it is never missing or half-written. */
async function point(link: string, release: string): Promise<void> {
  const temporary = `${link}.${process.pid}.tmp`;
  await rm(temporary, { force: true });
  await symlink(release, temporary);
  await rename(temporary, link);
}

async function pruneReleases(dir: string, keep: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  const stats = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({
        name: entry.name,
        time: (await stat(path.join(dir, entry.name))).mtimeMs,
      })),
  );
  const newest = stats.sort((a, b) => b.time - a.time).map((entry) => entry.name);
  const kept = new Set([keep, ...newest.slice(0, KEEP_RELEASES)]);
  for (const name of newest) {
    if (!kept.has(name)) await rm(path.join(dir, name), { recursive: true, force: true });
  }
}

async function containerId(host: Host, name: string): Promise<string | undefined> {
  const done = await host.docker(['inspect', '--format', '{{.Id}}', name]);
  return done.code === 0 && done.stdout.trim() !== '' ? done.stdout.trim() : undefined;
}

/** What is running, as ids and start times: two of these being equal is how a deployment knows it changed nothing. */
async function fingerprint(host: Host, apps: string[]): Promise<string> {
  const done = await host.docker([
    'inspect',
    '--format',
    '{{.Name}} {{.Id}} {{.State.StartedAt}}',
    CONTAINER.proxy,
    CONTAINER.database,
    CONTAINER.core,
    ...apps.map((name) => CONTAINER.app(name)),
  ]);
  return done.stdout.trim();
}
