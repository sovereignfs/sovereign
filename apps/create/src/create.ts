import { chmod, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GITIGNORE, LAUNCHER, packageJson, readme } from './templates.js';

/** Why the command stopped, and what to do. Nothing was written when it is `refused`. */
export class CreateError extends Error {
  override name = 'CreateError';

  constructor(
    message: string,
    readonly exitCode: 1 | 2,
    readonly hint?: string,
  ) {
    super(message);
  }
}

export type Exec = (
  command: string,
  args: readonly string[],
  options: { cwd: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export type CreateIo = {
  err(line: string): void;
  readonly interactive: boolean;
  ask(question: string): Promise<string>;
};

export type Request = {
  /** What to make: the word, or the flag that stands for it. Absent means ask. */
  kind: 'instance' | 'app' | undefined;
  dir: string | undefined;
  remote: string | undefined;
};

/**
 * Reads what `npm create @sovereignfs` was given: a word saying what to make and a directory, or the flag in its place, which npm
 * may have kept for itself and left in `npm_config_instance` / `npm_config_app` (operator-cli §2).
 */
export function readRequest(argv: readonly string[], env: NodeJS.ProcessEnv): Request {
  let kind: Request['kind'];
  let remote: string | undefined;
  const words: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] as string;
    if (word === '--instance') kind = 'instance';
    else if (word === '--app') kind = 'app';
    else if (word === '--remote') remote = argv[++i];
    else if (word.startsWith('--remote=')) remote = word.slice('--remote='.length);
    else if (word.startsWith('--'))
      throw new CreateError(
        `There is no option ${word}.`,
        2,
        'Use: npm create @sovereignfs instance <folder> [--remote URL]',
      );
    else words.push(word);
  }
  if (kind === undefined && (words[0] === 'instance' || words[0] === 'app'))
    kind = words.shift() as 'instance' | 'app';
  if (kind === undefined) {
    const set = (value: string | undefined) =>
      value !== undefined && value !== '' && value !== 'false';
    if (set(env.npm_config_instance)) kind = 'instance';
    else if (set(env.npm_config_app)) kind = 'app';
  }
  if (words.length > 1)
    throw new CreateError(
      `Too many arguments: ${words.slice(1).join(' ')}.`,
      2,
      'Use: npm create @sovereignfs instance <folder>',
    );
  return { kind, dir: words[0], remote };
}

/** Whether `dir` can be made into an instance: absent, or empty. Anything else is refused, and nothing is written. */
export async function checkEmpty(dir: string): Promise<void> {
  try {
    if ((await readdir(dir)).length > 0) {
      throw new CreateError(
        `${dir} is not empty.`,
        2,
        'Name a folder that does not exist yet, or is empty. Nothing was written.',
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/**
 * Makes an instance repository (operator-cli §2): the files, `git init`, the toolkit installed from the lockfile, the remote if one
 * was given, and the first commit. It does not push.
 */
export async function createInstance(
  request: { dir: string; remote: string | undefined; cliVersion: string },
  io: CreateIo,
  exec: Exec,
  cwd: string,
): Promise<void> {
  const target = path.resolve(cwd, request.dir);
  await checkEmpty(target);
  const name =
    path
      .basename(target)
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/^[-_.]+/, '') || 'instance';

  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'package.json'), packageJson(name, request.cliVersion));
  await writeFile(path.join(target, 'sv'), LAUNCHER);
  await chmod(path.join(target, 'sv'), 0o755);
  await writeFile(path.join(target, '.gitignore'), GITIGNORE);
  await writeFile(path.join(target, 'README.md'), readme(name));
  io.err(`Wrote the files of ${name}.`);

  const step = async (label: string, command: string, args: string[], hint: string) => {
    const done = await exec(command, args, { cwd: target });
    if (done.code !== 0) {
      throw new CreateError(
        `${label} failed: ${(done.stderr || done.stdout).trim().split('\n').slice(-3).join(' ')}`,
        1,
        hint,
      );
    }
  };
  await step(
    'git init',
    'git',
    ['init', '--initial-branch=main'],
    'Is git installed? Then run the rest by hand: see README.md.',
  );
  // npm writes the lockfile, with the exact version and its integrity, and `npm ci` installs from it and from nothing else.
  await step(
    'Resolving the toolkit',
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
    `Check the network, then run npm install --package-lock-only in ${request.dir}, and ./sv.`,
  );
  await step(
    'Installing the toolkit',
    'npm',
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    `Run ./sv in ${request.dir}: it installs the toolkit if it is missing.`,
  );
  if (request.remote) {
    await step(
      'git remote add',
      'git',
      ['remote', 'add', 'origin', request.remote],
      'Add it later with git remote add origin <url>.',
    );
  }
  await step(
    'git add',
    'git',
    ['add', '--', 'package.json', 'package-lock.json', 'sv', '.gitignore', 'README.md'],
    '',
  );
  await step(
    'The first commit',
    'git',
    ['commit', '-m', 'Create the instance'],
    'git needs a name and an email: git config --global user.name ... and user.email ..., then commit by hand.',
  );
  io.err(`Made ${name}. Next:\n  cd ${request.dir}\n  ./sv setup`);
}
