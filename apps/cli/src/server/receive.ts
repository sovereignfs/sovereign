import { existsSync, readlinkSync } from 'node:fs';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { byDigest } from '../apply/render.js';
import { docker, dockerVersions } from '../apply/docker.js';
import type { Host } from '../apply/host.js';
import { layout, readState } from '../apply/state.js';
import { GeneratedSecrets } from '../apply/secrets.js';
import { CONTAINER } from '../apply/names.js';
import { Failed, Locked, Refused } from '../errors.js';
import { readLock } from '../suite/files.js';
import { DEPLOY_ONLY, parseRequest, type Request } from './request.js';
import { IMAGE_BY_DIGEST } from './image.js';
import { extract, readArchive } from './tar.js';

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
  stdin: () => Promise<Buffer>;
  /** Standard output: what the request answers. */
  out: (text: string) => void;
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
  }
}

const running = async (host: Host, name: string) =>
  (await host.docker(['inspect', '--format', '{{.State.Running}}', name])).stdout.trim() === 'true';

/** Takes the archive, checks it holds only instance files, and starts `sv apply` on it from the image the commit’s lock names. */
async function deploy(
  host: ReceiverHost,
  options: ReceiveOptions,
  commit: string,
): Promise<number> {
  const { stateDir, out } = options;
  if (await running(host, APPLY_CONTAINER)) {
    throw new Locked(
      'Another deployment is running.',
      'sv logs deploy shows it. Run sv deploy again when it has finished.',
    );
  }
  const incoming = path.join(stateDir, 'incoming');
  await rm(incoming, { recursive: true, force: true });
  const dir = path.join(incoming, commit);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const entries = readArchive(await options.stdin(), isDeployPath);
  for (const required of ['suite.yml', 'suite.lock']) {
    if (!entries.some((entry) => entry.name === required))
      throw new Refused(`The archive has no ${required}.`);
  }
  await extract(entries, dir);
  out(`Received ${entries.length} files for ${commit.slice(0, 12)}.\n`);

  const lock = await readLock(dir);
  if (!lock) throw new Refused('The archive has no usable suite.lock.');
  const pinned = byDigest(lock.images.cli);
  const image = options.imageOverride ?? pinned;
  // The lock came in the archive: its image is run with the Docker socket, so it is checked to be an image by digest and not an option.
  if (!IMAGE_BY_DIGEST.test(pinned)) {
    throw new Refused(
      'The toolkit image in suite.lock is not an image by digest.',
      'Run sv push to refresh suite.lock.',
    );
  }
  if (!options.imageOverride && (await host.docker(['image', 'inspect', image])).code !== 0) {
    out(`Pulling the toolkit ${lock.images.cli.ref}.\n`);
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
    dir,
    '--commit',
    commit,
    ...(options.applyFlags ?? []),
  ]);
  // From here the deployment goes on whether or not anyone is watching: the container is not tied to this connection.
  await host.follow(['logs', '--follow', APPLY_CONTAINER], (chunk) => out(chunk));
  const waited = await host.docker(['wait', APPLY_CONTAINER]);
  const said = waited.stdout.trim();
  const code = Number(said);
  return waited.code === 0 && said !== '' && Number.isInteger(code) && code >= 0 && code <= 3
    ? code
    : 1;
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
