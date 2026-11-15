/**
 * The workflows every app calls from this repository (research 0007): the promotion check, and the release on merge. Each runs the app's
 * own pinned @sovereignfs/create, so an app's checks change only when it moves its pin.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, '.github/workflows', file), 'utf8');
const promotion = read('app-promotion.yml');
const release = read('app-release.yml');

describe.each([
  ['app-promotion.yml', promotion],
  ['app-release.yml', release],
])('%s', (_file, workflow) => {
  it('is only called, for an app in any folder with any tag prefix', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_call:\n {4}inputs:\n {6}directory:/m);
    expect(workflow).toContain('tag-prefix:');
    expect(workflow).not.toMatch(/^ {2}(push|pull_request|schedule):/m);
  });

  it('runs the app’s own pinned @sovereignfs/create, refusing a range', () => {
    expect(workflow).toContain("devDependencies?.['@sovereignfs/create']");
    expect(workflow).toContain('=~ ^[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain(
      'npm exec --yes --package="@sovereignfs/create@$CREATE" -- create app release check',
    );
  });

  it('reads the title from the environment, never in the script, and pins every action', () => {
    expect(workflow).toContain('PR_TITLE: ${{ github.event.pull_request.title }}');
    expect(workflow).not.toMatch(/run:.*github\.event\.pull_request\.title/);
    for (const action of workflow.matchAll(/uses: (\S+)/g))
      expect(action[1]).toMatch(/@[0-9a-f]{40}$/);
  });
});

describe('the app promotion check', () => {
  it('runs on a promotion from develop that is not a draft, named as the app’s ruleset requires it', () => {
    expect(promotion).toContain(
      "if: github.event.pull_request.draft == false && github.event.pull_request.head.ref == 'develop'",
    );
    expect(promotion).toContain('name: Promotion title');
  });

  it('checks the title, the commits’ trailers and the shared files', () => {
    expect(promotion).toContain('create app commits check "$BASE_SHA..$HEAD_SHA"');
    expect(promotion).toContain('create app sync --check --dir "$DIR"');
  });
});

describe('the app release', () => {
  it('acts only on a merged Release promotion from the app’s own develop, and hands the tag on', () => {
    for (const condition of [
      'github.event.pull_request.merged == true',
      "github.event.pull_request.head.ref == 'develop'",
      'github.event.pull_request.head.repo.full_name == github.repository',
      "startsWith(github.event.pull_request.title, 'Release')",
    ])
      expect(release).toContain(condition);
    expect(release).toContain('value: ${{ jobs.plan.outputs.tag }}');
  });

  it('checks the title against the merged code before it tags the merge commit', () => {
    expect(release).toContain('ref: ${{ github.event.pull_request.merge_commit_sha }}');
    expect(release.indexOf('--github-output')).toBeLessThan(release.indexOf('refs/tags/$TAG'));
    expect(release).toContain("if: steps.plan.outputs.tag != ''");
  });
});

describe('the commit apps call the shared workflows at', () => {
  it('holds the shared workflows as they are now, so a new or synced app calls these and not older ones', async () => {
    const { execFileSync } = await import('node:child_process');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    // A shallow clone (CI's checkout) may not have the commit; the check is for where the history is.
    if (git('rev-parse', '--is-shallow-repository').trim() === 'true') return;
    const versions = readFileSync(path.join(root, 'tools/create/src/versions.ts'), 'utf8');
    const ref = /SHARED_WORKFLOWS_REF = '([0-9a-f]{40})'/.exec(versions)?.[1];
    expect(ref, 'SHARED_WORKFLOWS_REF').toBeDefined();
    for (const file of ['app-promotion.yml', 'app-release.yml']) {
      expect(git('show', `${ref}:.github/workflows/${file}`), `${file} at ${ref}`).toBe(read(file));
    }
  });
});
