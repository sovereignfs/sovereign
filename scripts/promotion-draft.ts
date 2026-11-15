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
  changedVersions,
  identifier,
  promotionBody,
  promotionTitle,
  type Commit,
} from './lib/promotion';

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

const changes = changedVersions(versionOn);
const platform = versionOn('develop', '.') ?? '0.0.0';

const flag = process.argv.indexOf('--release');
const asked = flag === -1 ? [] : (process.argv[flag + 1] ?? '').split(',').filter(Boolean);
const released = new Set(
  asked.includes('all')
    ? changes
        .filter(({ unit }) => unit.published)
        .map(({ unit, to }) => identifier(unit.slug, to))
        .filter((id) => git('tag', '--list', id).trim() === '')
    : asked,
);
const known = new Set(changes.map(({ unit, to }) => identifier(unit.slug, to)));
for (const id of released) {
  if (!known.has(id) && id !== identifier(null, platform)) {
    console.error(`promotion:draft - ${id} is not a version this promotion changes.`);
    process.exit(1);
  }
}
// `Release` is for versions this promotion will tag once merged, never one already tagged.
for (const id of released) {
  if (git('tag', '--list', id).trim() !== '') {
    console.error(
      `promotion:draft - ${id} is already tagged; --release names only versions this promotion will tag.`,
    );
    process.exit(1);
  }
}

const shas = git('rev-list', '--no-merges', '--reverse', `${refs.main}..${refs.develop}`)
  .split('\n')
  .filter(Boolean);
const commits: Commit[] = shas.map((sha) => ({
  subject: git('log', '-1', '--format=%s', sha).trim(),
  files: git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean),
}));

console.log(`Title: ${promotionTitle(changes, platform, released)}\n`);
console.log(promotionBody(changes, commits, released));
