import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Failed, Refused } from '../errors.js';
import { SecretsFile, isCiphertext } from '../secrets/store.js';
import { appEnvProblems, manifestOf } from '../suite/apps.js';
import {
  KNOWN_DIRECTORIES,
  KNOWN_FILES,
  SuiteFile,
  isKnownPath,
  readLock,
} from '../suite/files.js';
import { lockProblems } from '../suite/lock.js';
import type { Problem } from '../suite/schema.js';
import { isExternal } from '../suite/types.js';

const list = (problems: Problem[]) => problems.map((p) => `  ${p.at}: ${p.message}`).join('\n');

async function git(ctx: Context, args: string[]) {
  const done = await ctx.exec('git', args, { cwd: ctx.root });
  return done;
}

/**
 * What `sv push` checks before it stages anything (operator-cli §4.5): the files meet their schemas, `suite.lock` matches
 * `suite.yml`, every app's manifest is good and its `env` is allowed, every secret is age ciphertext, and nothing that looks like a
 * secret is in the open. It is a guard and not a guarantee, and says so.
 */
export async function checkRepository(ctx: Context): Promise<void> {
  const file = await SuiteFile.load(ctx.root);
  const suite = file.value;
  const lock = await readLock(ctx.root);
  if (!lock) {
    throw new Refused(
      'There is no suite.lock.',
      'sv setup writes one, and every sv command that changes what runs refreshes it.',
    );
  }
  const problems: Problem[] = lockProblems(suite, lock);
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (isExternal(app)) continue;
    try {
      const manifest = await manifestOf(ctx, suite, lock, name);
      problems.push(...appEnvProblems(name, app, manifest));
    } catch (error) {
      if (error instanceof Refused) problems.push({ at: `apps.${name}`, message: error.message });
      else throw error;
    }
  }
  const secrets = (await SecretsFile.load(ctx.root)).value;
  for (const [who, names] of Object.entries(secrets)) {
    if (who !== 'core' && !(suite.apps && who in suite.apps) && !suite.purge?.includes(who)) {
      problems.push({
        at: `secrets.age.yml.${who}`,
        message: 'belongs to something that is not core or an app in suite.yml',
      });
    }
    for (const [name, value] of Object.entries(names)) {
      if (!isCiphertext(value)) {
        problems.push({
          at: `secrets.age.yml.${who}.${name}`,
          message: 'is not age ciphertext; set it again with sv secret set',
        });
      }
    }
  }
  if (problems.length > 0) {
    throw new Refused(
      `The repository does not pass its checks:\n${list(problems)}`,
      'Fix these and run sv push again. These checks are a guard and not a guarantee: they catch common mistakes, not every one.',
    );
  }
}

/** The paths git has staged, so none outside the known files is committed by this command. */
async function staged(ctx: Context): Promise<string[]> {
  const done = await git(ctx, ['diff', '--cached', '--name-only', '-z']);
  if (done.code !== 0) throw new Failed(`git could not list what is staged: ${done.stderr.trim()}`);
  return done.stdout.split('\0').filter(Boolean);
}

/** `sv push` (operator-cli §4.4, §4.5): checks, stages only the known files, commits, and pushes. It does not reach the server. */
export async function push(ctx: Context, argv: string[]): Promise<void> {
  // `-m` is accepted as git writes it.
  const args = parseArgs(
    argv.map((word) => (word === '-m' ? '--message' : word)),
    { message: 'value' },
  );
  positionals(args, 0, 'sv push [-m MESSAGE]');
  const message = args.values.get('message') ?? 'Update the instance';

  const inside = await git(ctx, ['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0)
    throw new Refused(
      'This folder is not a git repository.',
      'Run git init here, or make the instance with npm create @sovereignfs.',
    );
  const remote = await git(ctx, ['remote']);
  if (remote.code !== 0 || remote.stdout.trim() === '') {
    throw new Refused('The repository has no remote to push to.', 'git remote add origin <url>');
  }

  await checkRepository(ctx);

  const already = (await staged(ctx)).filter((path_) => !isKnownPath(path_));
  if (already.length > 0) {
    throw new Refused(
      `These are already staged, and are not files of the instance repository:\n${already.map((f) => `  ${f}`).join('\n')}`,
      'Unstage them with git restore --staged, or commit them yourself. sv push stages only its own files.',
    );
  }

  const present = [
    ...KNOWN_FILES.filter((known) => existsSync(path.join(ctx.root, known))),
    ...KNOWN_DIRECTORIES.filter((dir) => existsSync(path.join(ctx.root, dir))),
  ];
  const added = await git(ctx, ['add', '--', ...present]);
  if (added.code !== 0) throw new Failed(`git add failed: ${added.stderr.trim()}`);

  const changes = await git(ctx, ['diff', '--cached', '--quiet']);
  if (changes.code === 1) {
    const committed = await git(ctx, ['commit', '-m', message]);
    if (committed.code !== 0)
      throw new Failed(`git commit failed: ${(committed.stderr || committed.stdout).trim()}`);
    ctx.io.err(`Committed ${present.length > 0 ? 'the changed files' : 'the changes'}: ${message}`);
  } else {
    ctx.io.err('Nothing new to commit.');
  }

  // A branch that has never been pushed has nowhere to go until it is told: the first push sets it.
  const upstream = await git(ctx, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const pushed = await git(
    ctx,
    upstream.code === 0
      ? ['push']
      : ['push', '--set-upstream', remote.stdout.trim().split('\n')[0] as string, 'HEAD'],
  );
  if (pushed.code !== 0) {
    throw new Failed(
      `git push failed: ${pushed.stderr.trim()}`,
      'Fix what git says, then run sv push again.',
    );
  }
  const head = (await git(ctx, ['rev-parse', '--short', 'HEAD'])).stdout.trim();
  ctx.io.err(`Pushed ${head}. sv deploy puts it on the server.`);
}
