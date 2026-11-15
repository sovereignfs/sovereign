import { readFileSync } from 'node:fs';
import { checkCommitMessage } from './lib/commit-message';

const file = process.argv[2];
if (file === undefined) {
  console.error('check-commit-msg - give the commit message file (the commit-msg hook passes it).');
  process.exit(1);
}

const problems = checkCommitMessage(readFileSync(file, 'utf8'));
if (problems.length > 0) {
  console.error('check-commit-msg - the commit was refused:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
}
