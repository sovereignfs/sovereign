import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Failed, Refused } from '../errors.js';
import { WRAPPER_PATH } from '../server/wrapper.js';
import { targetOf, type Target } from '../server/remote.js';
import { SuiteFile } from '../suite/files.js';
import type { Suite } from '../suite/types.js';
import { DEPLOY_WORKFLOW } from '../suite/workflow.js';
import { checkRepository } from './push.js';
import { remoteFailure } from './server.js';
import path from 'node:path';

/** The files of the commit that go to the server: what `sv apply` reads, and nothing else of the repository. */
const SENT = ['suite.yml', 'suite.lock', 'secrets.age.yml', 'overrides'] as const;

async function git(ctx: Context, args: string[]) {
  return ctx.exec('git', args, { cwd: ctx.root });
}

/** Refuses work that is not in git, so that what is deployed is always something that can be read back (operator-cli §8). */
async function requirePushed(ctx: Context): Promise<string> {
  if ((await git(ctx, ['rev-parse', '--is-inside-work-tree'])).code !== 0)
    throw new Refused('This folder is not a git repository.');
  const head = await git(ctx, ['rev-parse', 'HEAD']);
  if (head.code !== 0)
    throw new Refused('There is nothing committed yet.', 'Run sv push, then sv deploy.');
  const present = SENT.filter((name) => existsSync(path.join(ctx.root, name)));
  const dirty = await git(ctx, ['status', '--porcelain', '--', ...present]);
  if (dirty.stdout.trim() !== '') {
    throw new Refused(
      `These changes are not committed:\n${dirty.stdout
        .trim()
        .split('\n')
        .map((l) => `  ${l.trim()}`)
        .join('\n')}`,
      'Run sv push, then sv deploy.',
    );
  }
  const upstream = await git(ctx, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream.code !== 0)
    throw new Refused('This branch has not been pushed.', 'Run sv push, then sv deploy.');
  const ahead = await git(ctx, ['rev-list', '--count', '@{u}..HEAD']);
  if (Number(ahead.stdout.trim()) > 0) {
    throw new Refused(
      `${ahead.stdout.trim()} commit${ahead.stdout.trim() === '1' ? ' is' : 's are'} not pushed.`,
      'Run sv push, then sv deploy.',
    );
  }
  return head.stdout.trim();
}

/** The pushed commit and the archive of its deployment files: what `sv deploy` sends, and what `sv restore` and `sv rollback` start from. */
export async function prepareDeployment(
  ctx: Context,
): Promise<{ commit: string; archive: Buffer }> {
  return archiveOf(ctx, await requirePushed(ctx));
}

async function archiveOf(
  ctx: Context,
  commit: string,
): Promise<{ commit: string; archive: Buffer }> {
  await checkRepository(ctx);
  const listed = await git(ctx, ['ls-tree', '--name-only', commit]);
  const paths = SENT.filter((name) => listed.stdout.split('\n').includes(name));
  return { commit, archive: await ctx.archive(ctx.root, commit, paths) };
}

/** `sv deploy` (operator-cli §8): sends the pushed commit’s files to the server and starts `sv apply` on them. */
export async function deploy(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { ssh: 'switch', github: 'switch', ci: 'switch' });
  positionals(args, 0, 'sv deploy [--ssh|--github]');
  if (args.switches.has('ssh') && args.switches.has('github'))
    throw new Refused('Choose one of --ssh and --github.');
  const file = await SuiteFile.load(ctx.root);
  const suite = file.value;
  // `--ci` is the runner’s way in (operator-cli §8.2): the deployment key, from the environment, and the checkout it is standing in.
  if (args.switches.has('ci')) return fromRunner(ctx, suite);
  const method = args.switches.has('ssh')
    ? 'ssh'
    : args.switches.has('github')
      ? 'github'
      : suite.server.deploy;
  if (method === undefined) {
    throw new Refused(
      'Say how to deploy.',
      'Pass --ssh or --github, or set server.deploy in suite.yml.',
    );
  }
  if (method === 'github') return startOnGitHub(ctx);
  const target = targetOf(suite);
  const { commit, archive } = await prepareDeployment(ctx);
  await send(ctx, target, commit, archive);

  // A purge has happened; the record of it is cleared here, and the next sv push commits that.
  if (suite.purge?.length) {
    await file.edit((doc) => doc.delete('purge'));
    ctx.io.err('The purge is done and is no longer recorded in suite.yml. sv push commits that.');
  }
  ctx.io.err(`Deployed ${commit.slice(0, 12)}. sv status shows how it is running.`);
}

/** Sends the archive and shows what the server prints as it does. */
async function send(ctx: Context, target: Target, commit: string, archive: Buffer): Promise<void> {
  ctx.io.err(`Sending ${commit.slice(0, 12)} to ${target.host}.`);
  const result = await ctx.remote(target, [WRAPPER_PATH, 'deploy', commit], {
    input: archive,
    onStdout: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
    onStderr: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
  });
  if (result.code !== 0) remoteFailure(result, 'The deployment');
}

/** `sv deploy --github`: starts the workflow that deploys, on the pushed commit, and says how to watch it. The runner does the rest. */
async function startOnGitHub(ctx: Context): Promise<void> {
  if (!existsSync(path.join(ctx.root, DEPLOY_WORKFLOW))) {
    throw new Refused(
      `There is no ${DEPLOY_WORKFLOW}.`,
      'sv setup --deploy github writes it; or add it by hand, calling the toolkit’s workflow.',
    );
  }
  await requirePushed(ctx);
  const branch = (await git(ctx, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  const started = await ctx.exec('gh', ['workflow', 'run', 'deploy.yml', '--ref', branch], {
    cwd: ctx.root,
  });
  if (started.code !== 0) {
    throw new Failed(
      `The GitHub CLI could not start the workflow: ${started.stderr.trim().split('\n').pop() ?? ''}`,
      'Install the GitHub CLI and log in with gh auth login; or just push to main, which deploys on its own.',
    );
  }
  ctx.io.err(`Started the deployment of ${branch} on GitHub. gh run watch follows it.`);
}

/**
 * What the reusable workflow runs on a GitHub runner (operator-cli §8.2): the checkout is the commit to deploy, and the only credential
 * is the deployment key, which can send a deployment and run nothing else. The key and the server’s host key go to files that are gone
 * when the command ends; nothing here holds a key that opens `secrets.age.yml`.
 */
async function fromRunner(ctx: Context, suite: Suite): Promise<void> {
  const key = ctx.env.SV_DEPLOY_KEY;
  if (!key?.trim()) {
    throw new Refused(
      'SV_DEPLOY_KEY is not set.',
      'sv server bootstrap prints the deployment key once; store it as a secret of that name in the repository’s Actions settings.',
    );
  }
  if (!suite.server.hostKey) {
    throw new Refused(
      'suite.yml does not hold the server’s host key, so a runner cannot tell it is deploying to the right machine.',
      'Run sv server bootstrap, then sv push.',
    );
  }
  const commit = (await git(ctx, ['rev-parse', 'HEAD'])).stdout.trim();
  const dirty = await git(ctx, [
    'status',
    '--porcelain',
    '--',
    ...SENT.filter((n) => existsSync(path.join(ctx.root, n))),
  ]);
  if (!commit || dirty.stdout.trim() !== '')
    throw new Refused('The checkout is not a clean commit.');
  const { archive } = await archiveOf(ctx, commit);

  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv-runner-'));
  try {
    const identityFile = path.join(dir, 'key');
    const knownHostsFile = path.join(dir, 'known_hosts');
    await writeFile(identityFile, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 });
    const base = targetOf(suite);
    const entry =
      base.port === undefined || base.port === 22 ? base.host : `[${base.host}]:${base.port}`;
    await writeFile(knownHostsFile, `${entry} ${suite.server.hostKey}\n`, { mode: 0o600 });
    await send(ctx, { ...base, identityFile, knownHostsFile }, commit, archive);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  ctx.io.err(`Deployed ${commit.slice(0, 12)}.`);
}
