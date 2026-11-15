/** Work also lands on `main` directly, so CI checks every push to it, and never cancels one of those runs. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

describe('the CI workflow', () => {
  it('runs on pushes to main as well as on pull requests', () => {
    expect(workflow).toMatch(/on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:/);
  });

  it('cancels superseded pull request runs only', () => {
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });

  it('classifies a push by what it changed, and falls back to everything', () => {
    expect(workflow).toContain('git diff --name-only "$BEFORE_SHA" "$AFTER_SHA"');
    expect(workflow).toContain('node scripts/ci-changes.ts --all');
  });
});
