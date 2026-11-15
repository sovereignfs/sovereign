/**
 * `npm create @sovereignfs app sync` (research 0007): writes an app's shared files from the template this version of
 * `@sovereignfs/create` holds, filled with the app's own values, so every app of the suite carries the same release workflows, settings,
 * contributing and release guides and agent conventions. `--check` writes nothing and says what differs, for the promotion check.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { namesOf } from './app.js';
import { CreateError, DEFAULT_APP_PORT } from './create.js';
import { fill, TEMPLATE, targetOf, type Fill } from './fill.js';
import { readReleases, type Releases } from './components.js';
import { isPrefix } from './release.js';
import { DEFAULT_REQUIRED_CHECKS, repositorySettings } from './settings-file.js';
import { SHARED_WORKFLOWS_REF } from './versions.js';

export const BEGIN = '<!-- sovereign:shared:begin -->';
export const END = '<!-- sovereign:shared:end -->';

/**
 * The shared files: where each is in the template, whether it belongs at the repository's root (workflows and settings) or in the app's
 * folder (documents), and how it is compared: whole, by content (JSON), or only its shared section (`CONTRIBUTING.md`, `AGENTS.md`), so
 * an app keeps its own sections of those around it.
 */
export const MANAGED = [
  { file: '_github/workflows/promotion.yml', at: 'root', kind: 'text' },
  { file: '_github/workflows/release.yml', at: 'root', kind: 'text' },
  { file: '_github/workflows/sync-develop.yml', at: 'root', kind: 'text' },
  { file: '_github/repository.json', at: 'root', kind: 'json' },
  { file: 'CONTRIBUTING.md', at: 'app', kind: 'section' },
  { file: 'RELEASING.md', at: 'app', kind: 'text' },
  { file: 'CLAUDE.md', at: 'app', kind: 'text' },
  { file: 'AGENTS.md', at: 'app', kind: 'section' },
] as const;

/** What the shared files need of an app, from its `package.json` (`name`, and `sovereign`) and its manifest (`port`). */
export type AppSettings = {
  name: string;
  tagPrefix: string;
  requiredChecks: string[];
  /** Shared files the app keeps as its own, by their path from the repository's root. */
  unmanaged: string[];
  port: number;
};

const strings = (value: unknown, what: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CreateError(`package.json's sovereign.${what} must be a list of strings.`, 1);
  }
  return value as string[];
};

export async function readAppSettings(appDir: string): Promise<AppSettings> {
  let manifest: { name?: unknown; sovereign?: Record<string, unknown> };
  try {
    manifest = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8'));
  } catch {
    throw new CreateError(`There is no package.json in ${appDir}.`, 1);
  }
  const name =
    typeof manifest.name === 'string' ? manifest.name.replace(/^@sovereignfs\//, '') : '';
  const own = manifest.sovereign ?? {};
  const tagPrefix = own.tagPrefix === undefined ? '' : own.tagPrefix;
  if (typeof tagPrefix !== 'string' || !isPrefix(tagPrefix)) {
    throw new CreateError(
      `package.json's sovereign.tagPrefix must be empty or end in "-", such as web-.`,
      1,
    );
  }
  let port = DEFAULT_APP_PORT;
  try {
    const app = JSON.parse(
      await readFile(path.join(appDir, 'sovereign.manifest.json'), 'utf8'),
    ) as { port?: unknown };
    if (typeof app.port === 'number') port = app.port;
  } catch {
    // An app without a manifest keeps the default port, which only README's examples use.
  }
  return {
    name,
    tagPrefix,
    requiredChecks:
      own.requiredChecks === undefined
        ? [...DEFAULT_REQUIRED_CHECKS]
        : strings(own.requiredChecks, 'requiredChecks'),
    unmanaged: strings(own.unmanaged, 'unmanaged'),
    port,
  };
}

/** A file's state after a sync or a check. */
export type Synced = {
  path: string;
  state: 'same' | 'written' | 'drifted' | 'unmanaged';
  reason?: string;
};

/** JSON as text with its keys sorted, so two files say the same when their content is the same, whatever their layout. */
const canonical = (text: string): string => {
  const sort = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sort)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sort((value as Record<string, unknown>)[key])]),
          )
        : value;
  try {
    return JSON.stringify(sort(JSON.parse(text)));
  } catch {
    return `not json: ${text}`;
  }
};

/** The shared section of an `AGENTS.md` or a `CONTRIBUTING.md`: from the line that begins it to the line that ends it, both included. */
export function sharedSection(text: string): string | undefined {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) return undefined;
  return text.slice(start, end + END.length);
}

const readText = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
};

/**
 * Writes (or with `check`, compares) an app's shared files. `appDir` is the app's folder; `gitRoot` is its repository's, where the
 * workflows and settings go. Nothing outside these files is touched, and an `AGENTS.md` keeps everything but its shared section.
 */
export async function syncApp(
  appDir: string,
  gitRoot: string,
  options: { check: boolean },
): Promise<Synced[]> {
  const releases = await readReleases(gitRoot, appDir, DEFAULT_REQUIRED_CHECKS);
  const several = releases.file === 'sovereign.json';
  // A repository of several components keeps its documents at its root; an app, in its folder.
  const docsDir = several ? gitRoot : appDir;
  const settings = several
    ? { port: DEFAULT_APP_PORT, tagPrefix: '' }
    : await readAppSettings(appDir);
  const names = namesOf(path.join(path.sep, releases.name || path.basename(appDir)));
  const directory = several ? '.' : path.relative(gitRoot, appDir) || '.';
  const values: Fill = {
    names,
    port: settings.port,
    workflowsRef: SHARED_WORKFLOWS_REF,
    directory: directory.split(path.sep).join('/'),
    tagPrefix: settings.tagPrefix,
  };
  const results: Synced[] = [];
  for (const entry of MANAGED) {
    const base = entry.at === 'root' ? gitRoot : docsDir;
    const target = path.join(base, targetOf(entry.file));
    const shown = path.relative(gitRoot, target).split(path.sep).join('/');
    if (releases.unmanaged.includes(shown)) {
      results.push({ path: shown, state: 'unmanaged' });
      continue;
    }
    let wanted =
      several && entry.file === '_github/workflows/release.yml'
        ? releaseWorkflowFor(releases)
        : fill(
            await readFile(
              several && entry.file === 'RELEASING.md'
                ? path.join(TEMPLATE, '..', 'components', 'RELEASING.md')
                : path.join(TEMPLATE, entry.file),
              'utf8',
            ),
            values,
          );
    if (entry.kind === 'json') wanted = repositorySettings(wanted, releases.requiredChecks);
    const present = await readText(target);

    let same: boolean;
    let next: string;
    let reason: string | undefined;
    if (entry.kind === 'section' && present !== undefined) {
      const section = sharedSection(wanted) as string;
      const current = sharedSection(present);
      same = current === section;
      next =
        current === undefined
          ? `${present.trimEnd()}\n\n${section}\n`
          : present.replace(current, section);
      if (current === undefined) reason = 'has no shared section';
    } else {
      same =
        present !== undefined &&
        (entry.kind === 'json' ? canonical(present) === canonical(wanted) : present === wanted);
      next = wanted;
      if (present === undefined) reason = 'is missing';
    }

    if (same) results.push({ path: shown, state: 'same' });
    else if (options.check)
      results.push({ path: shown, state: 'drifted', ...(reason ? { reason } : {}) });
    else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, next);
      results.push({ path: shown, state: 'written' });
    }
  }
  return results;
}

/**
 * The release workflow of a repository of several components: the shared plan, then one job for each component that calls its own publish
 * workflow with its tag when the plan made one. GitHub requires each called workflow to be written out, so it is made from the list.
 */
export function releaseWorkflowFor(releases: Releases): string {
  const lines = [
    'name: Release',
    '',
    '# Written by `npm create @sovereignfs app sync` from sovereign.json; do not edit it here (CONTRIBUTING.md, "Shared files"). When a',
    '# promotion pull request titled `Release …` is merged, the workflow every repository of the suite shares checks the title against the',
    '# merged code and tags the merge commit with each version it names; each component released is then published by its own workflow',
    '# (RELEASING.md). A title without `Release` publishes nothing.',
    'on:',
    '  pull_request:',
    '    branches: [main]',
    '    types: [closed]',
    '',
    'permissions:',
    '  contents: read',
    '',
    'concurrency:',
    '  group: release-${{ github.event.pull_request.number }}',
    '  cancel-in-progress: false',
    '',
    'jobs:',
    '  plan:',
    '    name: Plan',
    '    permissions:',
    '      contents: write',
    `    uses: sovereignfs/sovereign/.github/workflows/app-release.yml@${SHARED_WORKFLOWS_REF}`,
  ];
  for (const component of releases.components) {
    const tag = `fromJSON(needs.plan.outputs.tags || '{}')['${component.name}']`;
    lines.push(
      '',
      `  publish-${component.name}:`,
      `    name: Publish ${component.name}`,
      '    needs: plan',
      `    if: \${{ ${tag} != null }}`,
      '    permissions:',
      '      contents: write',
      '      packages: write',
      '      id-token: write',
      '      attestations: write',
      `    uses: ./.github/workflows/${component.publish}`,
      '    with:',
      `      tag: \${{ ${tag} }}`,
      '    secrets: inherit',
    );
  }
  return `${lines.join('\n')}\n`;
}
