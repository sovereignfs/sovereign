/**
 * Works out which CI jobs a change needs, so a documentation-only pull request
 * runs nothing but this classification.
 *
 * It is run by the first CI job under plain Node (type stripping) before any
 * dependency is installed, so it must stay self-contained: no imports, and only
 * syntax that Node can strip (no enums or namespaces).
 *
 *   git diff --name-only <base>...<head> | node scripts/ci-changes.ts >> "$GITHUB_OUTPUT"
 *   node scripts/ci-changes.ts --all >> "$GITHUB_OUTPUT"      # not a pull request
 *
 * The rule is deliberately one-sided: only paths known to be documentation are
 * skipped. A path it does not recognise runs the jobs, because wrongly running
 * CI costs minutes and wrongly skipping it costs a broken `main`.
 */
import { readFileSync } from 'node:fs';

export type Jobs = {
  format: boolean;
  lint: boolean;
  typecheck: boolean;
  test: boolean;
  build: boolean;
  /** The database test legs: sqld, SQLite file and PostgreSQL. */
  db: boolean;
  /** The dependency audit. */
  audit: boolean;
};

export const ALL_JOBS: Jobs = {
  format: true,
  lint: true,
  typecheck: true,
  test: true,
  build: true,
  db: true,
  audit: true,
};

/**
 * Paths that never need a job. Markdown is documentation except inside the
 * agent skill directories: a test keeps the `.agents` and `.claude` copies
 * identical, so changing one is a code change.
 */
function isDocumentation(path: string): boolean {
  if (path.startsWith('.agents/') || path.startsWith('.claude/')) return false;
  return (
    path.endsWith('.md') ||
    path.startsWith('docs/') ||
    path === 'LICENSE' ||
    path === 'MANIFESTO' ||
    path.startsWith('.github/ISSUE_TEMPLATE/') ||
    path.startsWith('.github/PULL_REQUEST_TEMPLATE/')
  );
}

/**
 * Files that configure tooling and cannot change what the database legs see. Like
 * documentation this list is closed, so that a path nobody thought of runs the
 * legs instead of skipping them.
 */
const TOOLING_FILES = new Set([
  'eslint.config.ts',
  'prettier.config.ts',
  '.prettierignore',
  '.editorconfig',
  '.gitignore',
  '.node-version',
  '.npmrc',
  'turbo.json',
  'tsconfig.json',
]);

function isToolingOnly(path: string): boolean {
  return TOOLING_FILES.has(path) || path.startsWith('types/') || path.startsWith('.github/');
}

/** Dependency manifests: a new or bumped dependency is what the audit is for. */
function touchesDependencies(path: string): boolean {
  return (
    path === 'package.json' ||
    path === 'pnpm-lock.yaml' ||
    path === 'pnpm-workspace.yaml' ||
    /^(apps|packages)\/[^/]+\/package\.json$/.test(path)
  );
}

/** The CI definition itself: when it changes, prove it by running everything. */
function isCiDefinition(path: string): boolean {
  return path.startsWith('.github/workflows/') || path.startsWith('.github/actions/');
}

export function classify(paths: readonly string[]): Jobs {
  const changed = paths.map((p) => p.trim()).filter((p) => p !== '');
  // An empty diff is suspicious (a force-push, a shallow clone): run everything.
  if (changed.length === 0) return { ...ALL_JOBS };

  const jobs: Jobs = {
    format: false,
    lint: false,
    typecheck: false,
    test: false,
    build: false,
    db: false,
    audit: false,
  };

  for (const path of changed) {
    if (isCiDefinition(path)) return { ...ALL_JOBS };
    if (isDocumentation(path)) continue;
    jobs.format = jobs.lint = jobs.typecheck = jobs.test = jobs.build = true;
    if (!isToolingOnly(path)) jobs.db = true;
    if (touchesDependencies(path)) jobs.audit = true;
  }
  return jobs;
}

/** One `name=value` line per job, the form a `$GITHUB_OUTPUT` file expects. */
export function toOutput(jobs: Jobs): string {
  return (
    (Object.keys(jobs) as (keyof Jobs)[]).map((name) => `${name}=${jobs[name]}`).join('\n') + '\n'
  );
}

if (import.meta.main) {
  const jobs = process.argv.includes('--all')
    ? { ...ALL_JOBS }
    : classify(readFileSync(0, 'utf8').split('\n'));
  process.stdout.write(toOutput(jobs));
}
