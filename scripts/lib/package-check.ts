/**
 * What a package that is published to npm must look like in its tarball. The checks are
 * pure (a manifest and a file list in, problems out) so they are tested; the runner that
 * packs the real packages is `scripts/check-packages.ts`.
 */

export type PackedManifest = {
  name?: string;
  version?: string;
  license?: string;
  private?: boolean;
  repository?: string | { type?: string; url?: string; directory?: string };
  files?: string[];
  types?: string;
  bin?: string | Record<string, string>;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

/** What never belongs in a published tarball. */
const FORBIDDEN = [
  { pattern: /(^|\/)src\//, why: 'source files' },
  { pattern: /(^|\/)__tests__\//, why: 'tests' },
  { pattern: /\.(test|spec)\.[cm]?[jt]sx?$/, why: 'tests' },
  { pattern: /\.stories\.[cm]?[jt]sx?$/, why: 'Storybook stories' },
  { pattern: /(^|\/)\.storybook\//, why: 'Storybook configuration' },
  { pattern: /(^|\/)\.env/, why: 'an environment file' },
  { pattern: /(^|\/)tsconfig[^/]*\.json$/, why: 'TypeScript configuration' },
  {
    pattern: /(^|\/)(playwright|vitest|tsup)\.[^/]*config\.[cm]?[jt]s$/,
    why: 'tool configuration',
  },
  { pattern: /(^|\/)node_modules\//, why: 'dependencies' },
];

/** Every string leaf of an `exports` value: the files it points at. */
function targets(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(targets);
  return [];
}

const WORKSPACE_PROTOCOLS = /^(workspace|catalog|link|file):/;

export type TarballFacts = {
  /** The text of `LICENSE` as it is in the tarball. pnpm puts the workspace root's licence in a package that has none of its own, so a file called LICENSE proves nothing. */
  licenseText?: string;
  /** The names of the packages that are published. A published package may depend on no other `@sovereignfs/*` package. */
  publishedNames?: ReadonlySet<string>;
  /** A library is imported (MPL-2.0, an exports map); a tool is run (AGPL-3.0-or-later, a `bin`). */
  kind?: 'library' | 'tool';
};

const MPL_HEADING = 'Mozilla Public License Version 2.0';
const AGPL_HEADING = 'GNU AFFERO GENERAL PUBLIC LICENSE';

/** This repository, which a published package's provenance names. */
const REPOSITORY = 'https://github.com/sovereignfs/sovereign';

export function tarballProblems(
  manifest: PackedManifest,
  files: readonly string[],
  facts: TarballFacts = {},
): string[] {
  const problems: string[] = [];
  const inTarball = new Set(files.map((file) => file.replace(/^package\//, '')));

  if (!manifest.name?.startsWith('@sovereignfs/'))
    problems.push('the name is not under @sovereignfs/');
  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version))
    problems.push('the version is not a plain x.y.z');
  if (manifest.private === true) problems.push('the package is private, so it cannot be published');
  // npm checks a provenance statement against repository.url, and refuses the upload when it is not this repository.
  const repository =
    typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  if (repository?.replace(/^git\+/, '').replace(/\.git$/, '') !== REPOSITORY)
    problems.push(
      `repository.url is ${repository ?? 'missing'}, not ${REPOSITORY}, so npm refuses its provenance`,
    );
  const tool = facts.kind === 'tool';
  const licence = tool ? 'AGPL-3.0-or-later' : 'MPL-2.0';
  if (manifest.license !== licence)
    problems.push(`the licence is ${manifest.license ?? 'missing'}, not ${licence}`);

  for (const required of ['package.json', 'LICENSE', 'README.md']) {
    if (!inTarball.has(required)) problems.push(`${required} is not in the tarball`);
  }
  if (
    facts.licenseText !== undefined &&
    !facts.licenseText.trimStart().startsWith(tool ? AGPL_HEADING : MPL_HEADING)
  ) {
    problems.push(
      `the LICENSE in the tarball is not the ${licence} text (does the package have its own LICENSE file?)`,
    );
  }
  // A file the manifest says to ship by name (NOTICE, say) must really be there.
  for (const entry of manifest.files ?? []) {
    const isDirectory = [...inTarball].some((file) => file.startsWith(`${entry}/`));
    if (!entry.includes('*') && !isDirectory && !inTarball.has(entry) && entry !== 'dist') {
      problems.push(`${entry} is listed in "files" but is not in the tarball`);
    }
  }

  const entryPoints = tool
    ? targets(manifest.bin)
    : [...targets(manifest.exports), ...(manifest.types ? [manifest.types] : [])];
  if (entryPoints.length === 0) problems.push(tool ? 'there is no bin' : 'there is no exports map');
  for (const target of entryPoints) {
    if (!target.startsWith('./dist/')) problems.push(`${target} points outside dist/`);
    else if (!inTarball.has(target.slice(2))) problems.push(`${target} is not in the tarball`);
  }

  for (const file of inTarball) {
    const forbidden = FORBIDDEN.find((rule) => rule.pattern.test(file));
    if (forbidden) problems.push(`${file} is in the tarball: ${forbidden.why} do not ship`);
  }

  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (WORKSPACE_PROTOCOLS.test(range)) {
        problems.push(
          `${field}.${name} is "${range}": a published package cannot depend on the workspace`,
        );
      }
      // pnpm rewrites `workspace:*` to a real version, so the range looks fine: what is wrong
      // is depending on a package that is not on npm. A development dependency never ships.
      if (
        facts.publishedNames &&
        field !== 'devDependencies' &&
        name.startsWith('@sovereignfs/') &&
        !facts.publishedNames.has(name)
      ) {
        problems.push(`${field}.${name} is not a published package, so npm could not install it`);
      }
    }
  }
  return problems;
}
