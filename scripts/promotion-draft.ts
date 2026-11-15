/**
 * Prints the title and body of the pull request that promotes `develop` into `main` (CONTRIBUTING.md). Compares `origin/main` with
 * `HEAD` (run it on an up-to-date `develop`).
 *
 *   pnpm promotion:draft                         # nothing will be tagged: the title is the versions
 *   pnpm promotion:draft --release v1.2.0,ui-v0.97.0   # these will be tagged on merge
 *   pnpm promotion:draft --release all           # every published version that changed, and is not tagged yet, will be tagged
 */
import { execFileSync } from 'node:child_process';
import {
  UNITS,
  changedVersions,
  identifier,
  promotionBody,
  promotionTitle,
  type Change,
  type Commit,
} from './lib/promotion';
import { checkTitle } from './lib/release';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });

const refs = { main: 'origin/main', develop: 'HEAD' } as const;

const versionOn = (ref: 'main' | 'develop', dir: string): string | undefined => {
  try {
    const text = git('show', `${refs[ref]}:${dir === '.' ? '' : `${dir}/`}package.json`);
    return (JSON.parse(text) as { version?: string }).version;
  } catch {
    return undefined;
  }
};

const changed = changedVersions(versionOn);
const platform = versionOn('develop', '.') ?? '0.0.0';
const isTagged = (id: string) => git('tag', '--list', id).trim() !== '';

const flag = process.argv.indexOf('--release');
const asked = flag === -1 ? [] : (process.argv[flag + 1] ?? '').split(',').filter(Boolean);
const releasedIds = asked.includes('all')
  ? changed
      .filter(({ unit }) => unit.published)
      .map(({ unit, to }) => identifier(unit.slug, to))
      .filter((id) => !isTagged(id))
  : asked;

// --release accepts what the Promotion title check accepts (pnpm release:check): a published version this code has, not tagged yet,
// whether or not it changed since the last promotion (one promoted before without Release can be released now).
const checked = checkTitle(
  `Release ${releasedIds.join(', ')}`,
  (dir) => versionOn('develop', dir),
  isTagged,
);
if (releasedIds.length > 0 && checked.problems.length > 0) {
  console.error('promotion:draft - --release names a version this promotion cannot release:\n');
  for (const problem of checked.problems) console.error(`  ${problem}`);
  process.exit(1);
}
const released = new Set(releasedIds);

// A released version that did not change since the last promotion is listed too, as unchanged.
const changes: Change[] = [...changed];
for (const { unit, version } of releasedIds.length > 0 ? checked.targets : []) {
  if (!changes.some((change) => change.unit === unit))
    changes.push({ unit, from: version, to: version });
}
changes.sort((a, b) => UNITS.indexOf(a.unit) - UNITS.indexOf(b.unit));

const shas = git('rev-list', '--no-merges', '--reverse', `${refs.main}..${refs.develop}`)
  .split('\n')
  .filter(Boolean);
const commits: Commit[] = shas.map((sha) => ({
  subject: git('log', '-1', '--format=%s', sha).trim(),
  files: git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean),
}));

console.log(`Title: ${promotionTitle(changes, platform, released)}\n`);
console.log(promotionBody(changes, commits, released));
