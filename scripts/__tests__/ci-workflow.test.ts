/**
 * CI runs only for pull requests into `main` that are not drafts (and release tags); CodeQL also scans each push to `main`. `develop` and feature branches are
 * checked by the pre-push hook, and by hand when wanted, so runner time is not spent on every commit.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

describe('the CI workflow', () => {
  it('runs on pull requests into main only: not on a push, never for develop', () => {
    expect(workflow).toMatch(/on:\n {2}pull_request:\n {4}branches: \[main\]/);
    expect(workflow).not.toMatch(/^ {2}push:/m);
    expect(workflow).not.toMatch(/branches: \[[^\]]*develop/);
  });

  it('skips a draft pull request', () => {
    expect(workflow).toContain('github.event.pull_request.draft == false');
  });

  it('cancels superseded pull request runs only', () => {
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });

  it('classifies a pull request by what it changed, and runs everything otherwise', () => {
    expect(workflow).toContain('git diff --name-only "$BASE_SHA...$HEAD_SHA"');
    expect(workflow).toContain('node scripts/ci-changes.ts --all');
  });
});

describe('the other workflows', () => {
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

  it('runs CodeQL for main only, and skips a draft', () => {
    const codeql = read('.github/workflows/codeql.yml');
    expect(codeql).toMatch(
      /push:\n {4}branches: \[main\]\n {2}pull_request:\n {4}branches: \[main\]/,
    );
    expect(codeql).toContain('github.event.pull_request.draft == false');
  });

  it('sends Dependabot’s pull requests into develop, for every ecosystem', () => {
    const config = read('.github/dependabot.yml');
    const ecosystems = config.match(/package-ecosystem:/g) ?? [];
    expect(ecosystems.length).toBeGreaterThan(0);
    expect(config.match(/target-branch: 'develop'/g)).toHaveLength(ecosystems.length);
  });
});
