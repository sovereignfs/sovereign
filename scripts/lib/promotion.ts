/**
 * The pull request that promotes `develop` into `main` (CONTRIBUTING.md, "Promoting develop into main"). Its title names what it
 * carries, by the identifiers tags and version commits use: the platform's `vX.Y.Z`, and `<slug>-vX.Y.Z` for each published package or
 * the toolkit whose version changed. Not every version is published, so the title starts with `Release` only when every identifier in
 * it will be tagged once the pull request is merged. The body lists every version that changed, core's and the private packages'
 * included, and the commits by the part of the repository they touch.
 */

/** A thing with a version: the platform (`slug` is null), core, a package or the toolkit. */
export type Unit = {
  /** `null` for the platform, whose tag is `vX.Y.Z`; otherwise the tag's prefix (`ui` → `ui-vX.Y.Z`). */
  slug: string | null;
  /** Where its `package.json` is, from the repository root. */
  dir: string;
  /** Whether a tag of it publishes something (the image, an npm package, the toolkit). */
  published: boolean;
};

/** Every versioned thing in this repository. `tools/create` is released with the toolkit, at its version, so it is not a unit. */
export const UNITS: readonly Unit[] = [
  { slug: null, dir: '.', published: true },
  { slug: 'core', dir: 'apps/core', published: false },
  { slug: 'cli', dir: 'tools/cli', published: true },
  { slug: 'ui', dir: 'packages/ui', published: true },
  { slug: 'sdk', dir: 'packages/sdk', published: true },
  { slug: 'manifest', dir: 'packages/manifest', published: true },
  { slug: 'config', dir: 'packages/config', published: true },
  { slug: 'storage', dir: 'packages/storage', published: true },
  { slug: 'pwa', dir: 'packages/pwa', published: true },
  { slug: 'bridge', dir: 'packages/bridge', published: false },
  { slug: 'mailer', dir: 'packages/mailer', published: false },
  { slug: 'crypto', dir: 'packages/crypto', published: false },
  { slug: 'database', dir: 'packages/database', published: false },
  { slug: 'api-client', dir: 'packages/api-client', published: false },
  { slug: 'auth', dir: 'packages/auth', published: true },
];

export type Change = { unit: Unit; from: string | undefined; to: string };

/** The identifier a version is tagged and committed under: `v1.2.3` or `ui-v1.2.3`. */
export const identifier = (slug: string | null, version: string) =>
  slug === null ? `v${version}` : `${slug}-v${version}`;

/** The units whose version differs between `main` and `develop`, in `UNITS` order. */
export function changedVersions(
  versionOn: (ref: 'main' | 'develop', dir: string) => string | undefined,
  units: readonly Unit[] = UNITS,
): Change[] {
  const changes: Change[] = [];
  for (const unit of units) {
    const to = versionOn('develop', unit.dir);
    if (to === undefined) continue;
    const from = versionOn('main', unit.dir);
    if (from !== to) changes.push({ unit, from, to });
  }
  return changes;
}

/**
 * The title: the changed published identifiers (the platform first), or the platform's current `vX.Y.Z` when none changed, with
 * `Release ` in front when every one of them is in `released`.
 */
export function promotionTitle(
  changes: readonly Change[],
  platformVersion: string,
  released: ReadonlySet<string>,
): string {
  const ids = changes
    .filter(({ unit }) => unit.published)
    .map(({ unit, to }) => identifier(unit.slug, to));
  const named = ids.length > 0 ? ids : [identifier(null, platformVersion)];
  const releasing = named.every((id) => released.has(id));
  return `${releasing ? 'Release ' : ''}${named.join(', ')}`;
}

/** The part of the repository a file is in, by which the body groups commits. */
export function areaOf(file: string): string {
  const [top, second] = file.split('/');
  if (top === 'apps' && second === 'core') return 'Core';
  if (top === 'apps' && second === 'e2e') return 'Acceptance tests';
  if (top === 'tools') return 'Toolkit';
  if (top === 'packages' && second !== undefined) return `@sovereignfs/${second}`;
  if (top === 'contracts') return 'Contracts';
  if (top === 'docs' || /\.md$/i.test(file)) return 'Documentation';
  return 'Repository';
}

export type Commit = { subject: string; files: readonly string[] };

/** The area most of a commit's files are in (the first such area when tied). */
export function primaryArea(files: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(areaOf(file), (counts.get(areaOf(file)) ?? 0) + 1);
  let best = 'Repository';
  let most = 0;
  for (const [area, count] of counts) {
    if (count > most) {
      best = area;
      most = count;
    }
  }
  return best;
}

/** The body: the versions that changed and whether each is published, then the commits by area. */
export function promotionBody(
  changes: readonly Change[],
  commits: readonly Commit[],
  released: ReadonlySet<string>,
): string {
  const lines: string[] = ['## Versions', ''];
  if (changes.length === 0) {
    lines.push('No version changed.');
  } else {
    lines.push(
      '| Version | From | Published on merge |',
      '| ------- | ---- | ------------------ |',
    );
    for (const { unit, from, to } of changes) {
      const id = identifier(unit.slug, to);
      const publish = !unit.published ? 'never (not published)' : released.has(id) ? 'yes' : 'no';
      const was =
        from === undefined ? 'new' : from === to ? 'unchanged (promoted before)' : `\`${from}\``;
      lines.push(`| \`${id}\` | ${was} | ${publish} |`);
    }
  }
  lines.push('', '## Changes', '');
  const byArea = new Map<string, string[]>();
  for (const commit of commits) {
    const area = primaryArea(commit.files);
    byArea.set(area, [...(byArea.get(area) ?? []), commit.subject]);
  }
  if (byArea.size === 0) lines.push('Nothing.');
  for (const area of [...byArea.keys()].sort()) {
    lines.push(`### ${area}`, '', ...(byArea.get(area) ?? []).map((subject) => `- ${subject}`), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
