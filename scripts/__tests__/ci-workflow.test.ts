/**
 * Work is committed directly on `develop` as well as merged into it, and `main` takes release pull requests, so CI checks every push to
 * either branch and every pull request into either, and never cancels a run on them.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

describe('the CI workflow', () => {
  it('runs on pushes to develop and main as well as on pull requests into either', () => {
    expect(workflow).toMatch(
      /on:\n {2}push:\n {4}branches: \[main, develop\]\n {2}pull_request:\n {4}branches: \[main, develop\]/,
    );
  });

  it('cancels superseded pull request runs only', () => {
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });

  it('classifies a push by what it changed, and falls back to everything', () => {
    expect(workflow).toContain('git diff --name-only "$BEFORE_SHA" "$AFTER_SHA"');
    expect(workflow).toContain('node scripts/ci-changes.ts --all');
  });
});

describe('the other workflows that follow develop', () => {
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

  it('runs CodeQL on develop too', () => {
    expect(read('.github/workflows/codeql.yml')).toMatch(
      /push:\n {4}branches: \[main, develop\]\n {2}pull_request:\n {4}branches: \[main, develop\]/,
    );
  });

  it('sends Dependabot’s pull requests into develop, for every ecosystem', () => {
    const config = read('.github/dependabot.yml');
    const ecosystems = config.match(/package-ecosystem:/g) ?? [];
    expect(ecosystems.length).toBeGreaterThan(0);
    expect(config.match(/target-branch: 'develop'/g)).toHaveLength(ecosystems.length);
  });
});
