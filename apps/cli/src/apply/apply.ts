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
import { Failed, Refused } from '../errors.js';
import { SecretsFile, decryptValue } from '../secrets/store.js';
import { SuiteFile, readLock, writeAtomically } from '../suite/files.js';
import { lockProblems } from '../suite/lock.js';
import type { Problem } from '../suite/schema.js';
import type { Suite } from '../suite/types.js';
import { takeBackup } from './backup.js';
import { look, refusals, refuseIfAny } from './checks.js';
import { composeUp, docker, ensureDatabase, ensureNetwork, ensureOnNetwork } from './docker.js';
import type { Host } from './host.js';
import { withLock } from './lock.js';
import { CONTAINER, CORE_DATABASE, CORE_ROLE, NETWORK, PROJECT } from './names.js';
import {
  GENERATED_FOR_CORE,
  caddyfile,
  coreCompose,
  databaseCompose,
  proxyCompose,
  publicNames,
  type BaseInput,
  type ImageOverrides,
} from './render.js';
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
  if (Object.values(suite.apps ?? {}).some(() => true)) {
    throw new Refused(
      'Apps are not applied by this version of the toolkit yet.',
      'Remove them from suite.yml for now.',
    );
  }
  const secrets = (await SecretsFile.load(options.from)).value;
  const overrides = await readOverrides(options.from);
  const state = await readState(options.stateDir);
  refuseIfAny('sv apply will not run:', [
    ...refusals({
      suite,
      state,
      secrets,
      coreOverride: overrides.compose.core,
      restore: options.restore,
    }),
    ...overrides.problems,
  ]);
  say('Checked suite.yml, suite.lock and the overrides.');

  // 2. Look.
  const names = publicNames(suite);
  const looked = await look({
    host,
    suite,
    stateDir: options.stateDir,
    skipDns: options.skipDns,
    publicNames: [names.core, ...Object.values(names.apps)],
  });
  for (const warning of looked.warnings) host.log(`Warning: ${warning}`);
  refuseIfAny('The machine is not ready:', looked.problems);
  say('Docker, disk space and DNS are as they should be.');

  const before = await fingerprint(host);
  const generated = new GeneratedSecrets(paths.secrets, host);

  // 3. Back up, when core or the database server changes version.
  if (
    state &&
    (state.core.version !== suite.core.version || state.database.version !== suite.database.version)
  ) {
    const archive = await takeBackup(host, {
      stateDir: options.stateDir,
      recipients: suite.secrets.recipients,
      reason: 'before-change',
    });
    say(`Backed up to ${archive}, because core or the database server is changing version.`);
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
    names: [names.core, ...Object.values(names.apps)],
  };
  const release = path.join(paths.releases, options.commit);
  await renderRelease(release, options, input, overrides);
  const caddyChanged = await writeProxyFiles(paths.proxy, suite, overrides);
  say(`Rendered release ${options.commit}.`);

  // 5. Start the base.
  await ensureNetwork(host, NETWORK.core);
  const adminPassword = await generated.ensure('postgres-admin-password', () =>
    generated.random(24),
  );
  const rolePassword = await generated.ensure('role-core-password', () => generated.random(24));
  const authSecret = await generated.ensure('SV_AUTH_SECRET', () => generated.random(48));
  const keys = await generated.ensure(
    'SV_FIELD_ENCRYPTION_KEYS',
    () => `k1:${host.random(32).toString('base64url')}`,
  );
  const secretsMade = [adminPassword, rolePassword, authSecret, keys].some(
    (secret) => secret.created,
  );
  await generated.write(
    'SV_POSTGRES_URL',
    `postgres://${CORE_ROLE}:${rolePassword.value}@${CONTAINER.database}:5432/${CORE_DATABASE}`,
  );
  for (const [name, value] of Object.entries(operatorSecrets.core ?? {}))
    await generated.write(name, value);
  await forgetRemovedOperatorSecrets(generated, state, operatorSecrets);

  await composeUp(host, {
    project: PROJECT.database,
    files: [path.join(release, 'database', 'compose.yml'), ...overrides.files.database],
  });
  await ensureDatabase(host, CORE_DATABASE, CORE_ROLE, rolePassword.value);
  say('The database server is up, with core’s database.');

  const proxyBefore = await containerId(host, CONTAINER.proxy);
  await composeUp(host, {
    project: PROJECT.proxy,
    files: [path.join(release, 'proxy', 'compose.yml'), ...overrides.files.proxy],
  });
  await ensureOnNetwork(host, CONTAINER.proxy, NETWORK.core, input.names);
  // A proxy that was already running and is still the same one is told to read its configuration again; a new one has just read it.
  if (
    caddyChanged &&
    proxyBefore !== undefined &&
    proxyBefore === (await containerId(host, CONTAINER.proxy))
  ) {
    await docker(host, 'Reloading the proxy', [
      'exec',
      CONTAINER.proxy,
      'caddy',
      'reload',
      '--config',
      '/etc/caddy/Caddyfile',
    ]);
  }
  if (internalCa) await fetchCertificateAuthority(host, paths.pki);
  say('The proxy is up.');

  await composeUp(host, {
    project: PROJECT.core,
    files: [path.join(release, 'core', 'compose.yml'), ...overrides.files.core],
  });
  say(`Core ${suite.core.version} is up and healthy.`);

  // 8. Verify.
  await verify(host, names);
  say('Core answers on its public name, over https, with the issuer it should have.');

  // 9. Record.
  await point(paths.current, release);
  const next: State = {
    schema: 1,
    commit: options.commit,
    appliedAt: new Date(host.now()).toISOString(),
    core: { version: suite.core.version, image: lock.images.core.digest, healthy: true },
    database: { version: suite.database.version },
    tls: suite.tls?.mode ?? 'per-host',
    apps: state?.apps ?? {},
    operatorSecrets: { core: Object.keys(operatorSecrets.core ?? {}) },
  };
  await writeState(options.stateDir, next);
  await pruneReleases(paths.releases, options.commit);
  const after = await fingerprint(host);
  const changed =
    secretsMade ||
    caddyChanged ||
    before !== after ||
    (state?.commit !== options.commit && state === undefined);
  say(changed ? 'Done.' : 'Nothing needed changing.');
  return { changed, release, steps };
}

type Overrides = {
  /** The contents of each Compose override, by project. */
  compose: Partial<Record<'core' | 'proxy' | 'database', string>>;
  /** Their paths in the release, which `docker compose` is given after the generated file. */
  files: Record<'core' | 'proxy' | 'database', string[]>;
  caddy: Record<string, string>;
  problems: Problem[];
};

/** Reads `overrides/` (spec/suite.md §5) and refuses what it must not do: publish a port, or change a network. */
async function readOverrides(from: string): Promise<Overrides> {
  const out: Overrides = {
    compose: {},
    files: { core: [], proxy: [], database: [] },
    caddy: {},
    problems: [],
  };
  const composeDir = path.join(from, 'overrides', 'compose');
  if (existsSync(composeDir)) {
    for (const entry of await readdir(composeDir)) {
      const name = entry.replace(/\.ya?ml$/, '');
      if (!['core', 'proxy', 'database'].includes(name) || !/\.ya?ml$/.test(entry)) continue;
      const text = await readFile(path.join(composeDir, entry), 'utf8');
      out.compose[name as 'core'] = text;
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
  };
  for (const [name, text] of Object.entries(projects)) {
    await mkdir(path.join(release, name), { recursive: true });
    await writeFile(path.join(release, name, 'compose.yml'), text);
  }
  for (const name of ['core', 'proxy', 'database'] as const) {
    if (overrides.compose[name] !== undefined) {
      overrides.files[name] = [path.join(release, 'overrides', 'compose', `${name}.yml`)];
      // An override named .yaml is read as it is; the copy keeps the name it had.
      if (!existsSync(overrides.files[name][0] as string)) {
        overrides.files[name] = [path.join(release, 'overrides', 'compose', `${name}.yaml`)];
      }
    }
  }
}

/** The proxy’s own files, at paths that do not change between deployments, so a deployment that changes nothing recreates nothing. */
async function writeProxyFiles(dir: string, suite: Suite, overrides: Overrides): Promise<boolean> {
  const names = publicNames(suite);
  const upstreams = [{ host: names.core, container: CONTAINER.core, port: 3000 }];
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

/**
 * From inside core (operator-cli §6.1, step 8): its public name answers over https, with a certificate that verifies, and core’s
 * discovery document names the issuer it should. Certificates are asked for on the first request, so it tries for a while.
 */
async function verify(host: Host, names: ReturnType<typeof publicNames>): Promise<void> {
  const script = `
const origin = process.argv[1];
(async () => {
  const response = await fetch(origin + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('discovery answered ' + response.status);
  const issuer = (await response.json()).issuer;
  if (issuer !== origin) throw new Error('discovery names the issuer ' + issuer);
})().catch((error) => { console.error(error.message); process.exit(1); });`;
  const origin = `https://${names.core}`;
  let last = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const done = await host.docker(['exec', CONTAINER.core, 'node', '-e', script, origin]);
    if (done.code === 0) return;
    last = (done.stderr || done.stdout).trim().split('\n').pop() ?? '';
    await host.sleep(3000);
  }
  throw new Failed(
    `${origin} did not answer from inside core: ${last}`,
    'Check DNS and that ports 80 and 443 reach this server; sv doctor looks at both.',
  );
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
  return done.code === 0 ? done.stdout.trim() : undefined;
}

/** What is running, as ids and start times: two of these being equal is how a deployment knows it changed nothing. */
async function fingerprint(host: Host): Promise<string> {
  const done = await host.docker([
    'inspect',
    '--format',
    '{{.Name}} {{.Id}} {{.State.StartedAt}}',
    CONTAINER.proxy,
    CONTAINER.database,
    CONTAINER.core,
  ]);
  return done.stdout.trim();
}
