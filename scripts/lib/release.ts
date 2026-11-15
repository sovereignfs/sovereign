/**
 * Releasing from the promotion pull request (CONTRIBUTING.md, "Promoting develop into main"). Its title names the versions it carries
 * (`v0.98.0, ui-v0.97.0`) and starts with `Release` when merging it publishes them. This checks such a title before the merge, and turns
 * a `Release` title into what to publish once it is merged: the image, the toolkit, and each npm package.
 */
import { UNITS, identifier, type Unit } from './promotion';

const ID = /^(?:([a-z][a-z0-9-]*)-)?v(\d+\.\d+\.\d+)$/;

export type Target = { id: string; unit: Unit; version: string };

export type Plan = {
  /** `vX.Y.Z`, for `ghcr.io/sovereignfs/sovereign` (publish-image.yml). */
  image: string | null;
  /** `cli-vX.Y.Z`, for the toolkit (publish-cli.yml). */
  cli: string | null;
  /** `<slug>-vX.Y.Z` for each npm package (publish.yml). */
  packages: string[];
};

export type Checked = { release: boolean; targets: Target[]; problems: string[] };

/** The words of a title: whether it starts with `Release`, and the identifiers after it. GitHub's ` (#35)` suffix is ignored. */
export function parseTitle(title: string): { release: boolean; ids: string[] } {
  const text = title.trim().replace(/\s+\(#\d+\)$/, '');
  const release = /^Release(\s|$)/.test(text);
  const rest = release ? text.replace(/^Release\s*/, '') : text;
  const ids = rest
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return { release, ids };
}

/** The unit an identifier's slug names: `null` is the platform. */
export function unitOf(slug: string | null): Unit | undefined {
  return UNITS.find((unit) => unit.slug === slug);
}

/**
 * Checks a promotion title against the versions in the code being promoted. Every identifier must be a version that code has. A
 * `Release` title must name only things that are published, none of them tagged already: `Release` is for versions this promotion
 * will tag, never one tagged before.
 */
export function checkTitle(
  title: string,
  versionAt: (dir: string) => string | undefined,
  isTagged: (id: string) => boolean,
): Checked {
  const { release, ids } = parseTitle(title);
  const problems: string[] = [];
  const targets: Target[] = [];
  if (ids.length === 0) problems.push('The title names no version, such as v1.2.3 or ui-v0.4.0.');
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      problems.push(`${id} is named twice.`);
      continue;
    }
    seen.add(id);
    const match = ID.exec(id);
    if (!match) {
      problems.push(`"${id}" is not a version as tags name one (v1.2.3, or <name>-v1.2.3).`);
      continue;
    }
    const slug = match[1] ?? null;
    const version = match[2] ?? '';
    const unit = unitOf(slug);
    if (!unit) {
      problems.push(`${id}: there is no "${slug ?? ''}" to version.`);
      continue;
    }
    const actual = versionAt(unit.dir);
    if (actual !== version) {
      problems.push(
        `${id}: ${unit.dir === '.' ? 'the root package.json' : `${unit.dir}/package.json`} is ${actual ?? 'missing'}, not ${version}.`,
      );
      continue;
    }
    if (release && !unit.published) {
      problems.push(`${id}: ${unit.dir} is not published, so a Release title cannot name it.`);
      continue;
    }
    if (release && isTagged(id)) {
      problems.push(
        `${id} is tagged already; Release names only versions this promotion will tag.`,
      );
      continue;
    }
    targets.push({ id, unit, version });
  }
  return { release, targets, problems };
}

/** What a merged `Release` promotion publishes, by workflow. */
export function planOf(targets: readonly Target[]): Plan {
  const plan: Plan = { image: null, cli: null, packages: [] };
  for (const { id, unit } of targets) {
    if (unit.slug === null) plan.image = id;
    else if (unit.slug === 'cli') plan.cli = id;
    else plan.packages.push(id);
  }
  return plan;
}

/** The section of a Keep a Changelog file for one version, without its heading; undefined when it has none. */
export function changelogSection(text: string, version: string): string | undefined {
  const lines = text.split('\n');
  const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body === '' ? undefined : body;
}

/** The changelog of a unit: the one beside its package.json. */
export const changelogPath = (unit: Unit) =>
  unit.dir === '.' ? 'CHANGELOG.md' : `${unit.dir}/CHANGELOG.md`;

/** The identifier of a unit at a version, as a tag names it. */
export { identifier };
