import { existsSync } from 'node:fs';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import { WRAPPER_PATH } from '../server/wrapper.js';
import { targetOf } from '../server/remote.js';
import { SuiteFile } from '../suite/files.js';
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
  const commit = await requirePushed(ctx);
  await checkRepository(ctx);
  const listed = await git(ctx, ['ls-tree', '--name-only', commit]);
  const paths = SENT.filter((name) => listed.stdout.split('\n').includes(name));
  return { commit, archive: await ctx.archive(ctx.root, commit, paths) };
}

/** `sv deploy` (operator-cli §8): sends the pushed commit’s files to the server and starts `sv apply` on them. */
export async function deploy(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { ssh: 'switch', github: 'switch' });
  positionals(args, 0, 'sv deploy [--ssh|--github]');
  if (args.switches.has('ssh') && args.switches.has('github'))
    throw new Refused('Choose one of --ssh and --github.');
  const file = await SuiteFile.load(ctx.root);
  const suite = file.value;
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
  if (method === 'github') {
    throw new Refused(
      'Deploying from GitHub is not in this version of the toolkit yet.',
      'Use sv deploy --ssh.',
    );
  }
  const target = targetOf(suite);
  const { commit, archive } = await prepareDeployment(ctx);

  ctx.io.err(`Sending ${commit.slice(0, 12)} to ${target.host}.`);
  const result = await ctx.remote(target, [WRAPPER_PATH, 'deploy', commit], {
    input: archive,
    onStdout: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
    onStderr: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
  });
  if (result.code !== 0) remoteFailure(result, 'The deployment');

  // A purge has happened; the record of it is cleared here, and the next sv push commits that.
  if (suite.purge?.length) {
    await file.edit((doc) => doc.delete('purge'));
    ctx.io.err('The purge is done and is no longer recorded in suite.yml. sv push commits that.');
  }
  ctx.io.err(`Deployed ${commit.slice(0, 12)}. sv status shows how it is running.`);
}
