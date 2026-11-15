/**
 * The commands an app's repository runs through `npm create @sovereignfs app …` once it exists (research 0007): checking a promotion title,
 * reading a version's release notes, checking commits' trailers, and (below) keeping the shared files in step and the repository's
 * settings as code. Each answers with an exit code: 0 for good, 1 for a problem found, 2 for a command used wrongly.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { appendFile } from 'node:fs/promises';
import { CreateError, type CreateIo, type Exec } from './create.js';
import { changelogSection, checkTitle, isPrefix, tagOf, trailerProblems } from './release.js';
import { syncApp } from './sync.js';

export { TOOL_COMMANDS } from './commands.js';

export type ToolContext = {
  io: CreateIo & { out: (line: string) => void };
  exec: Exec;
  cwd: string;
  env: NodeJS.ProcessEnv;
};

/** The value after an option (`--title T` or `--title=T`), and the words that are not options. */
export function optionsOf(
  argv: readonly string[],
  valued: readonly string[],
  switches: readonly string[] = [],
) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const words: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] as string;
    const eq = word.indexOf('=');
    const name = word.startsWith('--')
      ? eq === -1
        ? word.slice(2)
        : word.slice(2, eq)
      : undefined;
    if (name !== undefined && valued.includes(name)) {
      const value = eq === -1 ? argv[++i] : word.slice(eq + 1);
      if (value === undefined) throw new CreateError(`--${name} needs a value.`, 2);
      values.set(name, value);
    } else if (name !== undefined && switches.includes(name) && eq === -1) flags.add(name);
    else if (name !== undefined) throw new CreateError(`There is no option ${word}.`, 2);
    else words.push(word);
  }
  return { values, flags, words };
}

async function readVersion(dir: string): Promise<string> {
  try {
    const { version } = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    if (typeof version === 'string' && version !== '') return version;
  } catch {
    // Said below.
  }
  throw new CreateError(`There is no version in ${path.join(dir, 'package.json')}.`, 1);
}

async function readChangelog(dir: string): Promise<string> {
  try {
    return await readFile(path.join(dir, 'CHANGELOG.md'), 'utf8');
  } catch {
    return '';
  }
}

/** Runs a command of this file; the caller has seen its first word is one of `TOOL_COMMANDS`. */
export async function runTool(argv: readonly string[], ctx: ToolContext): Promise<number> {
  const [command, verb, ...rest] = argv;
  if (command === 'release' && verb === 'check') return releaseCheck(rest, ctx);
  if (command === 'release' && verb === 'notes') return releaseNotes(rest, ctx);
  if (command === 'commits' && verb === 'check') return commitsCheck(rest, ctx);
  if (command === 'sync')
    return sync(
      [verb, ...rest].filter((word) => word !== undefined),
      ctx,
    );
  throw new CreateError(
    `There is no command ${[command, verb].filter(Boolean).join(' ')}.`,
    2,
    'Use: npm create @sovereignfs app release check --title T, app release notes VERSION, app commits check BASE..HEAD',
  );
}

/**
 * `release check --title T [--dir D] [--prefix P] [--github-output]`: holds a promotion title to the app in D (its package.json version,
 * its tags, its changelog). With --github-output it writes release=, tag= and version= to $GITHUB_OUTPUT for the release workflow.
 */
async function releaseCheck(argv: readonly string[], ctx: ToolContext): Promise<number> {
  const { values, flags, words } = optionsOf(argv, ['title', 'dir', 'prefix'], ['github-output']);
  if (words.length > 0) throw new CreateError(`Too many arguments: ${words.join(' ')}.`, 2);
  const title = values.get('title') ?? ctx.env.PR_TITLE;
  if (title === undefined) throw new CreateError('Give the title with --title, or in PR_TITLE.', 2);
  const prefix = values.get('prefix') ?? '';
  if (!isPrefix(prefix))
    throw new CreateError(`--prefix "${prefix}" must be empty or end in "-", such as web-.`, 2);
  const dir = path.resolve(ctx.cwd, values.get('dir') ?? '.');
  const version = await readVersion(dir);
  const tag = tagOf(prefix, version);
  const listed = await ctx.exec('git', ['tag', '--list', tag], { cwd: dir });
  const checked = checkTitle(title, {
    version,
    prefix,
    tagged: listed.code === 0 && listed.stdout.trim() !== '',
    hasNotes: changelogSection(await readChangelog(dir), version) !== undefined,
  });
  if (checked.problems.length > 0) {
    ctx.io.err(`The title "${title}" does not match the app:`);
    for (const problem of checked.problems) ctx.io.err(`  ${problem}`);
    return 1;
  }
  ctx.io.out(JSON.stringify({ release: checked.release, tag: checked.tag, version }));
  if (flags.has('github-output')) {
    const file = ctx.env.GITHUB_OUTPUT;
    if (!file) throw new CreateError('--github-output needs GITHUB_OUTPUT.', 2);
    await appendFile(
      file,
      `release=${String(checked.release)}\ntag=${checked.release ? checked.tag : ''}\nversion=${version}\n`,
    );
  }
  return 0;
}

/** `release notes VERSION [--dir D]`: the version's section of the app's CHANGELOG.md, for the GitHub release. */
async function releaseNotes(argv: readonly string[], ctx: ToolContext): Promise<number> {
  const { values, words } = optionsOf(argv, ['dir']);
  const [version, ...more] = words;
  if (version === undefined || more.length > 0)
    throw new CreateError('Give one version: release notes 1.2.0.', 2);
  const dir = path.resolve(ctx.cwd, values.get('dir') ?? '.');
  const section = changelogSection(
    await readChangelog(dir),
    version.replace(/^(?:[a-z][a-z0-9-]*-)?v/, ''),
  );
  if (section === undefined) {
    ctx.io.err(`CHANGELOG.md in ${dir} has no section for ${version}.`);
    return 1;
  }
  ctx.io.out(section);
  return 0;
}

/** `commits check BASE..HEAD`: every commit in the range carries only the agent trailers allowed. */
async function commitsCheck(argv: readonly string[], ctx: ToolContext): Promise<number> {
  const { words } = optionsOf(argv, []);
  const [range, ...more] = words;
  if (range === undefined || !range.includes('..') || more.length > 0) {
    throw new CreateError('Give one range: commits check origin/main..HEAD.', 2);
  }
  const log = await ctx.exec('git', ['log', '--no-merges', '--format=%H%x1f%B%x1e', range], {
    cwd: ctx.cwd,
  });
  if (log.code !== 0) throw new CreateError(`git log ${range} failed: ${log.stderr.trim()}`, 1);
  const refused: string[] = [];
  for (const record of log.stdout.split('\x1e')) {
    const [sha, message] = record.trim().split('\x1f');
    if (!sha || message === undefined) continue;
    for (const problem of trailerProblems(message)) refused.push(`${sha.slice(0, 7)}: ${problem}`);
  }
  if (refused.length > 0) {
    ctx.io.err(`${refused.length} commit(s) in ${range} carry a trailer that is not allowed:`);
    for (const line of refused) ctx.io.err(`  ${line}`);
    return 1;
  }
  ctx.io.out(`Every commit in ${range} has allowed trailers.`);
  return 0;
}

/**
 * `sync [--check] [--dir D]`: writes the app's shared files from this version's template, or with --check writes nothing and fails when
 * any differs. D is the app's folder (default: here); the workflows and settings go to its repository's root.
 */
async function sync(argv: readonly string[], ctx: ToolContext): Promise<number> {
  const { values, flags, words } = optionsOf(argv, ['dir'], ['check']);
  if (words.length > 0) throw new CreateError(`Too many arguments: ${words.join(' ')}.`, 2);
  const appDir = path.resolve(ctx.cwd, values.get('dir') ?? '.');
  const top = await ctx.exec('git', ['rev-parse', '--show-toplevel'], { cwd: appDir });
  const gitRoot = top.code === 0 && top.stdout.trim() !== '' ? top.stdout.trim() : appDir;
  const check = flags.has('check');
  const results = await syncApp(appDir, gitRoot, { check });
  for (const result of results) {
    const said = {
      same: 'the same',
      written: 'written',
      drifted: 'differs from the template',
      unmanaged: "kept as the app's own",
    }[result.state];
    const line = `  ${result.path}: ${said}${result.reason ? ` (${result.reason})` : ''}`;
    if (result.state === 'drifted') ctx.io.err(line);
    else ctx.io.out(line);
  }
  const drifted = results.filter((result) => result.state === 'drifted');
  if (drifted.length > 0) {
    ctx.io.err(
      `${drifted.length} shared file(s) differ from the template. Run npm create @sovereignfs app sync, or list a file under sovereign.unmanaged in package.json if this app keeps it as its own.`,
    );
    return 1;
  }
  return 0;
}
