/**
 * Checks the title of a promotion pull request (develop -> main) against the code it promotes, and prints what merging it publishes.
 *
 *   pnpm release:check --title "Release v0.98.0, ui-v0.97.0" [--ref <commit>] [--github-output]
 *
 * It fails, saying why, when the title names a version the code does not have, or a Release title names something unpublished or
 * already tagged. On success it prints the plan as JSON; with --github-output it also writes image=, cli=, packages= and release= to
 * $GITHUB_OUTPUT for the release workflow.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { checkTitle, planOf } from './lib/release';

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};

const title = arg('--title') ?? process.env.PR_TITLE;
if (title === undefined) {
  console.error('release:check - give the title with --title, or in PR_TITLE.');
  process.exit(1);
}
const ref = arg('--ref') ?? 'HEAD';
const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const versionAt = (dir: string): string | undefined => {
  try {
    const text = git('show', `${ref}:${dir === '.' ? '' : `${dir}/`}package.json`);
    return (JSON.parse(text) as { version?: string }).version;
  } catch {
    return undefined;
  }
};
const isTagged = (id: string): boolean => {
  try {
    git('rev-parse', '--quiet', '--verify', `refs/tags/${id}`);
    return true;
  } catch {
    return false;
  }
};

const checked = checkTitle(title, versionAt, isTagged);
if (checked.problems.length > 0) {
  console.error(`release:check - the title "${title}" does not match the code:\n`);
  for (const problem of checked.problems) console.error(`  ${problem}`);
  console.error('\npnpm promotion:draft prints the title this promotion should have.');
  process.exit(1);
}

const plan = checked.release ? planOf(checked.targets) : { image: null, cli: null, packages: [] };
console.log(JSON.stringify({ release: checked.release, ...plan }));
if (process.argv.includes('--github-output')) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) {
    console.error('release:check - --github-output needs GITHUB_OUTPUT.');
    process.exit(1);
  }
  appendFileSync(
    out,
    [
      `release=${String(checked.release)}`,
      `image=${plan.image ?? ''}`,
      `cli=${plan.cli ?? ''}`,
      `packages=${JSON.stringify(plan.packages)}`,
    ].join('\n') + '\n',
  );
}
