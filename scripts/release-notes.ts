/**
 * Prints the release notes for a tag: that version's section of the component's CHANGELOG.md, read from the checked-out code. The
 * publish workflows make the GitHub release from it.
 *
 *   pnpm release:notes ui-v0.97.0 [--pr <url>]
 */
import { readFileSync } from 'node:fs';
import { changelogPath, changelogSection, parseTitle, unitOf } from './lib/release';

const tag = process.argv[2];
const at = process.argv.indexOf('--pr');
const pr = at === -1 ? undefined : process.argv[at + 1];
const match = tag === undefined ? null : /^(?:([a-z][a-z0-9-]*)-)?v(\d+\.\d+\.\d+)$/.exec(tag);
if (!tag || !match || parseTitle(tag).ids.length !== 1) {
  console.error('release:notes - give one tag, such as v1.2.3 or ui-v0.4.0.');
  process.exit(1);
}
const unit = unitOf(match[1] ?? null);
if (!unit) {
  console.error(`release:notes - ${tag} names nothing that is versioned here.`);
  process.exit(1);
}
const file = changelogPath(unit);
const section = changelogSection(readFileSync(file, 'utf8'), match[2] ?? '');
if (section === undefined) {
  console.error(`release:notes - ${file} has no section for ${match[2] ?? ''}.`);
  process.exit(1);
}
console.log(section);
if (pr) console.log(`\nPromoted in ${pr}.`);
