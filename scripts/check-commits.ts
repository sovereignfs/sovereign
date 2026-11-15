/**
 * Checks every commit in a range for the agent trailers AGENTS.md allows, as the commit-msg hook does for one commit. A hook can be
 * missing from a clone or skipped with --no-verify; the Promotion title check runs this over what a promotion brings to main.
 *
 *   pnpm commits:check <base>..<head>
 */
import { execFileSync } from 'node:child_process';
import { checkCommitMessage } from './lib/commit-message';

const range = process.argv[2];
if (range === undefined || !range.includes('..')) {
  console.error('commits:check - give a range, such as origin/main..HEAD.');
  process.exit(1);
}
const log = execFileSync('git', ['log', '--no-merges', '--format=%H%x1f%B%x1e', range], {
  encoding: 'utf8',
});
const refused: string[] = [];
for (const record of log.split('\x1e')) {
  const [sha, message] = record.trim().split('\x1f');
  if (!sha || message === undefined) continue;
  for (const problem of checkCommitMessage(message)) refused.push(`${sha.slice(0, 7)}: ${problem}`);
}
if (refused.length > 0) {
  console.error(
    `commits:check - ${refused.length} commit(s) in ${range} carry a trailer that is not allowed:\n`,
  );
  for (const line of refused) console.error(`  ${line}`);
  console.error(
    '\nFix the message (on a branch, before it reaches develop), or say so in the pull request if it is already on develop.',
  );
  process.exit(1);
}
console.log(`commits:check - every commit in ${range} has allowed trailers.`);
