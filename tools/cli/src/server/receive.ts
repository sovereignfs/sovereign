import { existsSync, readlinkSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { byDigest } from '../apply/render.js';
import { docker, dockerVersions } from '../apply/docker.js';
import type { Host } from '../apply/host.js';
import { layout, readState } from '../apply/state.js';
import { GeneratedSecrets } from '../apply/secrets.js';
import { CONTAINER } from '../apply/names.js';
import { Failed, Locked, Refused } from '../errors.js';
import { gt } from 'semver';
import { takeBackup } from '../apply/backup.js';
import { SuiteFile, readLock } from '../suite/files.js';
import { DEPLOY_ONLY, parseRequest, type Request } from './request.js';
import { IMAGE_BY_DIGEST } from './image.js';
import { MAX_ARCHIVE_BYTES, extract, readArchive, splitRestore } from './tar.js';

/** The server's side of the operator's commands (operator-cli §8): what the wrapper installed by `sv server bootstrap` starts. */
export interface ReceiverHost extends Host {
  /** Runs docker and hands what it prints to `write` as it arrives, for a deployment the operator is watching. Resolves with its exit code. */
  follow(args: readonly string[], write: (chunk: string) => void): Promise<number>;
}

export type ReceiveOptions = {
  line: string;
  /** The key that only deploys: it may ask for nothing else. */
  deployOnly: boolean;
  stateDir: string;
  /** Everything standard input holds, up to `max` bytes. */
  stdin: (max: number) => Promise<Buffer>;
  /** Standard output: what the request answers. */
  out: (text: string) => void;
  /** Sends a file to standard output as it is, for a backup. */
  sendFile?: (file: string) => Promise<void>;
  /** Used by a test that runs a locally built image. Nothing in the toolkit sets it. */
  imageOverride?: string;
  /** Passed to `sv apply`, for a test on a machine that shares its ports. */
  applyFlags?: string[];
};

/** The files a deployment may hold: what `sv apply` reads, and nothing else. */
export const isDeployPath = (name: string) =>
  ['suite.yml', 'suite.lock', 'secrets.age.yml'].includes(name) || name.startsWith('overrides/');

/** The container the deployment runs in, named so that `sv logs deploy` finds it and a second deployment cannot start beside it. */
export const APPLY_CONTAINER = 'sv-apply';
const SOCKET = '/var/run/docker.sock';
/** Bumped when the wrapper or the requests change in a way an older toolkit cannot talk to. */
export const PROTOCOL = 1;

/** Answers one request, and returns the exit code `sv` should end with (operator-cli §11). */
export async function receive(host: ReceiverHost, options: ReceiveOptions): Promise<number> {
  const request = parseRequest(options.line);
  if (options.deployOnly && !DEPLOY_ONLY.includes(request.verb)) {
    throw new Refused(
      'This key can deploy and do nothing else.',
      'Use the operator’s own SSH access for this.',
    );
  }
  switch (request.verb) {
    case 'version':
      options.out(`${PROTOCOL}\n`);
      return 0;
    case 'deploy':
      return deploy(host, options, request.commit);
    case 'status':
      return status(host, options);
    case 'doctor':
      return doctor(host, options);
    case 'logs':
      return logs(host, options, request);
    case 'app':
      return app(host, options, request);
    case 'rotate':
      return rotate(host, options, request.name);
    case 'backup':
      return backup(host, options);
    case 'restore':
      return restore(host, options, request.commit);
    case 'rollback':
      return rollback(host, options);
  }
}

const running = async (host: Host, name: string) =>
  (await host.docker(['inspect', '--format', '{{.State.Running}}', name])).stdout.trim() === 'true';

/** Refuses while a deployment, a restore or a rollback is running: they share one container, and one run at a time. */
async function requireIdle(host: Host): Promise<void> {
  if (await running(host, APPLY_CONTAINER)) {
    throw new Locked(
      'Another deployment is running.',
      'sv logs deploy shows it. Run the command again when it has finished.',
    );
  }
}

/** Reads the deployment files out of an archive into `incoming/<commit>/`, and says what the commit's lock names. */
async function unpack(
  options: ReceiveOptions,
  commit: string,
  archive: Buffer,
): Promise<{ dir: string; pinned: string; files: number }> {
  const dir = path.join(options.stateDir, 'incoming', commit);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const entries = readArchive(archive, isDeployPath);
  for (const required of ['suite.yml', 'suite.lock']) {
    if (!entries.some((entry) => entry.name === required))
      throw new Refused(`The archive has no ${required}.`);
  }
  await extract(entries, dir);
  const lock = await readLock(dir);
  if (!lock) throw new Refused('The archive has no usable suite.lock.');
  const pinned = byDigest(lock.images.cli);
  // The lock came in the archive: its image is run with the Docker socket, so it is checked to be an image by digest and not an option.
  if (!IMAGE_BY_DIGEST.test(pinned)) {
    throw new Refused(
      'The toolkit image in suite.lock is not an image by digest.',
      'Run sv push to refresh suite.lock.',
    );
  }
  return { dir, pinned, files: entries.length };
}

/** Starts `sv apply` on the files in `dir`, detached, follows it to its end, and returns the code it ended with. */
async function launch(
  host: ReceiverHost,
  options: ReceiveOptions,
  input: { commit: string; dir: string; pinned: string; extra?: string[] },
): Promise<number> {
  const { stateDir, out } = options;
  const image = options.imageOverride ?? input.pinned;
  if (!options.imageOverride && (await host.docker(['image', 'inspect', image])).code !== 0) {
    out(`Pulling the toolkit ${image.split('@')[0]}.\n`);
    await docker(host, 'Pulling the toolkit', ['pull', image]);
  }
  await host.docker(['rm', '--force', APPLY_CONTAINER]);
  await docker(host, 'Starting sv apply', [
    'run',
    '--detach',
    '--init',
    '--name',
    APPLY_CONTAINER,
    '--volume',
    `${SOCKET}:${SOCKET}`,
    '--volume',
    `${stateDir}:${stateDir}`,
    '--env',
    `SV_STATE_DIR=${stateDir}`,
    '--env',
    `SV_TOOLKIT_IMAGE=${image}`,
    image,
    'apply',
    '--from',
    input.dir,
    '--commit',
    input.commit,
    ...(input.extra ?? []),
    ...(options.applyFlags ?? []),
  ]);
  // From here the run goes on whether or not anyone is watching: the container is not tied to this connection.
  await host.follow(['logs', '--follow', APPLY_CONTAINER], (chunk) => out(chunk));
  const waited = await host.docker(['wait', APPLY_CONTAINER]);
  const said = waited.stdout.trim();
  const code = Number(said);
  return waited.code === 0 && said !== '' && Number.isInteger(code) && code >= 0 && code <= 3
    ? code
    : 1;
}

/** Takes the archive, checks it holds only instance files, and starts `sv apply` on it from the image the commit's lock names. */
async function deploy(
  host: ReceiverHost,
  options: ReceiveOptions,
  commit: string,
): Promise<number> {
  await requireIdle(host);
  const incoming = path.join(options.stateDir, 'incoming');
  await rm(incoming, { recursive: true, force: true });
  const { dir, pinned, files } = await unpack(
    options,
    commit,
    await options.stdin(MAX_ARCHIVE_BYTES),
  );
  options.out(`Received ${files} files for ${commit.slice(0, 12)}.\n`);
  return launch(host, options, { commit, dir, pinned });
}

/** The backup's files, and nothing else: the databases, the generated secrets, and the app data (operator-cli §10.2). */
export const isBackupPath = (name: string) =>
  name === 'databases.sql' ||
  name === 'state.json' ||
  /^secrets\/[A-Za-z0-9_.-]{1,128}$/.test(name) ||
  /^volumes\/sovereign-app-[a-z0-9-]+_data-[0-9]+\.tar$/.test(name);
const MAX_RESTORE_BYTES = 1024 ** 3;

/** `sv restore`: the deployment's files and the backup arrive together; `sv apply` brings the instance to the commit and puts the data back. */
async function restore(
  host: ReceiverHost,
  options: ReceiveOptions,
  commit: string,
): Promise<number> {
  await requireIdle(host);
  const incoming = path.join(options.stateDir, 'incoming');
  await rm(incoming, { recursive: true, force: true });
  const sent = splitRestore(await options.stdin(MAX_RESTORE_BYTES));
  const backup = readArchive(sent.backup, isBackupPath, {
    maxBytes: MAX_RESTORE_BYTES,
    stripDot: true,
  });
  if (!backup.some((entry) => entry.name === 'databases.sql'))
    throw new Refused('The backup holds no databases.', 'This is not a backup taken by sv backup.');
  const { dir, pinned, files } = await unpack(options, commit, sent.deployment);
  const data = path.join(incoming, 'restore');
  await mkdir(data, { recursive: true, mode: 0o700 });
  // state.json is in the backup for a person to read; the restore makes its own, from the files it applies.
  await extract(
    backup.filter((entry) => entry.name !== 'state.json'),
    data,
  );
  options.out(
    `Received ${files} files for ${commit.slice(0, 12)} and a backup of ${backup.length} files.\n`,
  );
  return launch(host, options, { commit, dir, pinned, extra: ['--restore-from', data] });
}

/** `sv rollback`: applies the previous release's files again (operator-cli §10.3), unless core would go backward. */
async function rollback(host: ReceiverHost, options: ReceiveOptions): Promise<number> {
  await requireIdle(host);
  const state = await readState(options.stateDir);
  if (!state?.previous) {
    throw new Refused(
      'There is no earlier release to go back to.',
      'sv status shows what is running.',
    );
  }
  const release = path.join(layout(options.stateDir).releases, state.previous);
  if (!existsSync(path.join(release, 'suite.lock'))) {
    throw new Refused(
      `The release ${state.previous.slice(0, 12)} is no longer on the server.`,
      'Only the last five are kept. Deploy the commit you want with sv deploy.',
    );
  }
  const before = (await SuiteFile.load(release)).value;
  if (gt(state.core.version, before.core.version)) {
    throw new Refused(
      `Core ${state.core.version} cannot go back to ${before.core.version}: its migrations only go forward.`,
      'sv restore brings a backup taken before the upgrade back.',
    );
  }
  await rm(path.join(options.stateDir, 'incoming'), { recursive: true, force: true });
  const dir = path.join(options.stateDir, 'incoming', state.previous);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  for (const name of ['suite.yml', 'suite.lock', 'secrets.age.yml', 'overrides']) {
    if (existsSync(path.join(release, name)))
      await cp(path.join(release, name), path.join(dir, name), { recursive: true });
  }
  const lock = await readLock(dir);
  if (!lock) throw new Refused('That release has no usable suite.lock.');
  const pinned = byDigest(lock.images.cli);
  if (!IMAGE_BY_DIGEST.test(pinned))
    throw new Refused('That release names a toolkit that is not an image by digest.');
  options.out(`Going back to ${state.previous.slice(0, 12)}.\n`);
  return launch(host, options, { commit: state.previous, dir, pinned });
}

/** `sv backup`: a backup of the instance, encrypted to the operator's keys alone, sent down the connection and not kept on the server. */
async function backup(host: Host, options: ReceiveOptions): Promise<number> {
  const paths = layout(options.stateDir);
  if (!options.sendFile) throw new Refused('This connection cannot carry a backup.');
  if (!existsSync(path.join(paths.current, 'suite.yml'))) {
    throw new Refused('Nothing has been deployed yet, so there is nothing to back up.');
  }
  await requireIdle(host);
  const suite = (await SuiteFile.load(paths.current)).value;
  const imageFile = path.join(options.stateDir, 'toolkit-image');
  const file = await takeBackup(host, {
    stateDir: options.stateDir,
    recipients: suite.secrets.recipients,
    reason: 'manual',
    ...(existsSync(imageFile) ? { image: (await readFile(imageFile, 'utf8')).trim() } : {}),
  });
  try {
    await options.sendFile(file);
  } finally {
    await rm(file, { force: true });
  }
  return 0;
}

async function status(host: Host, options: ReceiveOptions): Promise<number> {
  const paths = layout(options.stateDir);
  const listed = await docker(host, 'Listing the containers', [
    'ps',
    '--all',
    '--filter',
    'name=^sv-',
    '--format',
    '{{json .}}',
  ]);
  const containers = listed.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string>)
    .map((c) => ({ name: c.Names, state: c.State, status: c.Status, image: c.Image }));
  options.out(
    `${JSON.stringify({
      state: (await readState(options.stateDir)) ?? null,
      current: existsSync(paths.current) ? path.basename(readlinkSync(paths.current)) : null,
      containers,
      deploying: await running(host, APPLY_CONTAINER),
    })}\n`,
  );
  return 0;
}

async function doctor(host: Host, options: ReceiveOptions): Promise<number> {
  const proxy = await host.docker([
    'inspect',
    '--format',
    '{{json .NetworkSettings.Ports}}',
    CONTAINER.proxy,
  ]);
  const incoming = existsSync(path.join(options.stateDir, 'incoming'))
    ? (await readdir(path.join(options.stateDir, 'incoming'))).length
    : 0;
  options.out(
    `${JSON.stringify({
      protocol: PROTOCOL,
      docker: await dockerVersions(host),
      freeBytes: existsSync(options.stateDir) ? await host.freeBytes(options.stateDir) : null,
      stateDir: existsSync(options.stateDir),
      proxyPorts: proxy.code === 0 ? (JSON.parse(proxy.stdout || 'null') as unknown) : null,
      incoming,
      toolkitImage: existsSync(path.join(options.stateDir, 'toolkit-image'))
        ? (await readFile(path.join(options.stateDir, 'toolkit-image'), 'utf8')).trim()
        : null,
    })}\n`,
  );
  return 0;
}

async function logs(
  host: Host,
  options: ReceiveOptions,
  request: Extract<Request, { verb: 'logs' }>,
): Promise<number> {
  const container =
    request.target === 'deploy'
      ? APPLY_CONTAINER
      : request.target === 'mailpit'
        ? CONTAINER.mail
        : ['core', 'proxy', 'database'].includes(request.target)
          ? `sv-${request.target}`
          : CONTAINER.app(request.target);
  const done = await host.docker(['logs', '--tail', String(request.lines), container]);
  if (done.code !== 0) {
    throw new Refused(
      `There is nothing called ${request.target} running or kept.`,
      'sv status lists what is.',
    );
  }
  // A container’s two streams are both what it printed.
  options.out(`${done.stdout}${done.stderr}`);
  return 0;
}

async function app(
  host: Host,
  options: ReceiveOptions,
  request: Extract<Request, { verb: 'app' }>,
): Promise<number> {
  const found = (await readState(options.stateDir))?.apps[request.name];
  if (!found) throw new Refused(`The server has no record of ${request.name}.`, 'sv status.');
  if (request.secret) {
    const secret = await new GeneratedSecrets(layout(options.stateDir).secrets, host).read(
      `app-${request.name}-client-secret`,
    );
    if (secret === undefined)
      throw new Refused(`${request.name} has no client secret: it is a public app.`);
    options.out(`${secret}\n`);
    return 0;
  }
  options.out(`${JSON.stringify({ name: request.name, ...found })}\n`);
  return 0;
}

/** Gives an app a new client secret and restarts it (operator-cli §9.3). The old one stops working at once. */
async function rotate(host: Host, options: ReceiveOptions, name: string): Promise<number> {
  const found = (await readState(options.stateDir))?.apps[name];
  if (!found) throw new Refused(`The server has no record of ${name}.`, 'sv status.');
  if (await running(host, APPLY_CONTAINER)) {
    throw new Locked('A deployment is running.', 'Rotate the secret when it has finished.');
  }
  const done = await docker(host, `Giving ${name} a new secret`, [
    'exec',
    CONTAINER.core,
    'sovereign-admin',
    'apps',
    'rotate-secret',
    name,
    '--json',
  ]);
  const secret = (JSON.parse(done.stdout.trim().split('\n').pop() ?? '{}') as { secret?: string })
    .secret;
  if (!secret) throw new Failed(`Core gave no new secret for ${name}.`);
  await new GeneratedSecrets(layout(options.stateDir).secrets, host).write(
    `app-${name}-client-secret`,
    secret,
  );
  if (found.kind === 'hosted') {
    await docker(host, `Restarting ${name}`, ['restart', CONTAINER.app(name)]);
  }
  options.out(`${JSON.stringify({ rotated: name, restarted: found.kind === 'hosted' })}\n`);
  return 0;
}
