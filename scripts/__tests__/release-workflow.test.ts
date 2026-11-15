/**
 * Releasing from a merged promotion: its title is checked before the merge (promotion.yml), and a `Release` title tags the merge commit
 * and calls the publish workflows (release.yml), each of which reads the version's changelog section before publishing and makes the
 * GitHub release from it after.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, '.github/workflows', file), 'utf8');
const release = read('release.yml');
const promotion = read('promotion.yml');
/** Each publish workflow's first publishing job, which waits for the notes, and its last, after which the GitHub release is made. */
const publishers = {
  'publish.yml': ['publish', 'publish'],
  'publish-image.yml': ['image', 'image'],
  'publish-cli.yml': ['image', 'npm'],
} as const;

describe('the promotion title check', () => {
  it('runs on a promotion into main when its title or code changes, and not for a draft', () => {
    expect(promotion).toMatch(/pull_request:\n {4}branches: \[main\]/);
    expect(promotion).toContain('types: [opened, edited, synchronize, reopened, ready_for_review]');
    expect(promotion).toContain('github.event.pull_request.draft == false');
    expect(promotion).toContain("github.event.pull_request.head.ref == 'develop'");
  });

  it('checks the title from the environment, never pasted into the script', () => {
    expect(promotion).toContain('PR_TITLE: ${{ github.event.pull_request.title }}');
    expect(promotion).toContain('run: pnpm -s release:check');
    expect(promotion).not.toMatch(/run:.*github\.event\.pull_request\.title/);
  });
});

describe('the release workflow', () => {
  it('acts only on a merged Release promotion from this repository’s develop', () => {
    expect(release).toMatch(/pull_request:\n {4}branches: \[main\]\n {4}types: \[closed\]/);
    for (const condition of [
      'github.event.pull_request.merged == true',
      "github.event.pull_request.head.ref == 'develop'",
      'github.event.pull_request.head.repo.full_name == github.repository',
      "startsWith(github.event.pull_request.title, 'Release')",
    ])
      expect(release).toContain(condition);
  });

  it('checks the title again against the merged code, then tags the merge commit', () => {
    expect(release).toContain('ref: ${{ github.event.pull_request.merge_commit_sha }}');
    expect(release).toContain('run: pnpm -s release:check --ref HEAD --github-output');
    expect(release).toContain('-f "ref=refs/tags/$tag" -f "sha=$MERGE_SHA"');
    expect(release.indexOf('release:check')).toBeLessThan(release.indexOf('refs/tags/'));
    expect(release).not.toMatch(/run:.*github\.event\.pull_request\.title/);
  });

  it('calls each publish workflow with its tag, and holds no token of its own', () => {
    expect(release).toContain('uses: ./.github/workflows/publish-image.yml');
    expect(release).toContain('uses: ./.github/workflows/publish-cli.yml');
    expect(release).toContain('uses: ./.github/workflows/publish.yml');
    expect(release).toContain('tag: ${{ matrix.tag }}');
    expect(release).toContain('matrix:\n        tag: ${{ fromJSON(needs.plan.outputs.packages) }}');
    expect(release).not.toMatch(/secrets\.[A-Z_]+/);
    // Only the npm releases need the npm token, which they inherit.
    expect(release.match(/secrets: inherit/g)).toHaveLength(2);
  });
});

describe.each(Object.entries(publishers))('%s', (file, [first, last]) => {
  const workflow = read(file);

  it('can be called with the tag to release, and still starts on a pushed tag', () => {
    expect(workflow).toMatch(/push:\n {4}tags:/);
    expect(workflow).toMatch(/workflow_call:\n {4}inputs:\n {6}tag:[\s\S]*?required: true/);
    expect(workflow).not.toContain('TAG: ${{ github.ref_name }}');
    expect(workflow).toContain('TAG: ${{ inputs.tag || github.ref_name }}');
    expect(workflow).toContain('ref: ${{ inputs.tag }}');
    expect(workflow).not.toContain('$GITHUB_SHA');
    expect(workflow).not.toContain('${{ github.sha }}');
  });

  it('reads the changelog section before publishing, and makes the GitHub release after', () => {
    expect(workflow).toContain('pnpm -s release:notes "$TAG"');
    expect(workflow).toMatch(new RegExp(`\\n  ${first}:[\\s\\S]*?needs: \\[validate, notes\\]`));
    expect(workflow).toMatch(new RegExp(`\\n  release:[\\s\\S]*?needs: \\[${last}, notes\\]`));
    expect(workflow).toContain('gh release create "$TAG" --repo "$GITHUB_REPOSITORY" --verify-tag');
    expect(workflow).toContain('BODY: ${{ needs.notes.outputs.body }}');
  });
});
