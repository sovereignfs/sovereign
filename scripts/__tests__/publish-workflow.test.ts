/**
 * The publish workflow releases a package when its tag is pushed. If a published package had no
 * tag there, it could never be released; if a private package had one, a tag could try to publish
 * something that must never reach npm. This keeps the workflow and the packages in step.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workflow = readFileSync(path.join(root, '.github/workflows/publish.yml'), 'utf8');
const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const imageWorkflow = readFileSync(path.join(root, '.github/workflows/publish-image.yml'), 'utf8');

const packages = readdirSync(path.join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    dir: entry.name,
    manifest: JSON.parse(
      readFileSync(path.join(root, 'packages', entry.name, 'package.json'), 'utf8'),
    ) as { private?: boolean },
  }));

const published = packages.filter((p) => p.manifest.private !== true).map((p) => p.dir);
const privatePackages = packages.filter((p) => p.manifest.private === true).map((p) => p.dir);

describe('the publish workflow', () => {
  it('finds the published packages it is meant to check', () => {
    expect(published).toEqual(['sdk', 'ui']);
  });

  // A decision, not an accident: the device bridge is not published for now. Publishing it later
  // means removing "private" and adding its tag to the workflow, and this test with them.
  it('keeps the device bridge private, with no release tag', () => {
    expect(privatePackages).toContain('bridge');
    expect(workflow).not.toContain('bridge-v');
  });

  it.each(published)('releases %s on its own tag and knows its directory', (dir) => {
    expect(workflow).toContain(`- '${dir}-v*.*.*'`);
    expect(workflow).toMatch(new RegExp(`${dir}-v\\*\\)\\s+dir=${dir};`));
  });

  it('has a tag for no package that is private', () => {
    for (const dir of privatePackages) {
      expect(workflow, `${dir} is private`).not.toContain(`'${dir}-v*.*.*'`);
    }
  });

  it('runs the whole CI on the tagged commit before it publishes', () => {
    expect(workflow).toMatch(/validate:[\s\S]*uses: \.\/\.github\/workflows\/ci\.yml/);
    expect(workflow).toMatch(/publish:[\s\S]*needs: validate/);
    expect(ci).toMatch(/^\s{2}workflow_call:/m);
  });

  it('refuses a tagged commit that is not on main, and a tag that does not match the version', () => {
    expect(workflow).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main');
    expect(workflow).toContain('expects $name@$expected');
  });

  it('checks the tarball and signs provenance, with the token only in the publish step', () => {
    expect(workflow).toContain('pnpm packages:check');
    expect(workflow).toContain('--provenance');
    expect(workflow).toContain('id-token: write');
    expect(workflow.match(/secrets\.NPM_TOKEN/g)).toHaveLength(1);
  });

  it('installs without a cache, so nothing it publishes depends on one', () => {
    expect(workflow).toMatch(/\.\/\.github\/actions\/setup\s+with:\s+cache: 'false'/);
    expect(workflow).toContain('package-manager-cache: false');
  });
});

describe('the image workflow', () => {
  it('releases on the platform version tag, and the npm workflow does not', () => {
    expect(imageWorkflow).toContain("- 'v*.*.*'");
    expect(workflow).not.toContain("- 'v*.*.*'");
  });

  it('runs the whole CI on the tagged commit before it publishes', () => {
    expect(imageWorkflow).toMatch(/validate:[\s\S]*uses: \.\/\.github\/workflows\/ci\.yml/);
    expect(imageWorkflow).toMatch(/image:[\s\S]*needs: validate/);
  });

  it('refuses a tagged commit that is not on main, and a tag that does not match the version', () => {
    expect(imageWorkflow).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main');
    expect(imageWorkflow).toContain("require('./package.json').version");
    expect(imageWorkflow).toContain('expects version $expected');
  });

  it('checks the version and the commit before it can log in or push', () => {
    const login = imageWorkflow.indexOf('docker/login-action');
    expect(login).toBeGreaterThan(imageWorkflow.indexOf('expects version $expected'));
    expect(login).toBeGreaterThan(imageWorkflow.indexOf('git merge-base --is-ancestor'));
    expect(imageWorkflow.indexOf('docker/build-push-action')).toBeGreaterThan(login);
  });

  it('publishes both architectures, by version and as latest, from a build with no cache', () => {
    expect(imageWorkflow).toContain('platforms: linux/amd64,linux/arm64');
    expect(imageWorkflow).toContain('${{ env.IMAGE }}:${{ steps.version.outputs.version }}');
    expect(imageWorkflow).toContain('${{ env.IMAGE }}:${{ steps.version.outputs.minor }}');
    expect(imageWorkflow).toContain('${{ env.IMAGE }}:latest');
    expect(imageWorkflow).toContain('no-cache: true');
    expect(imageWorkflow).not.toContain('cache-from');
  });

  it('gives only the publishing job the right to push, with the token of the run', () => {
    expect(imageWorkflow.match(/packages: write/g)).toHaveLength(1);
    expect(imageWorkflow.split('image:\n')[1]).toContain('packages: write');
    expect(imageWorkflow.match(/secrets\.[A-Z_]+/g)).toEqual(['secrets.GITHUB_TOKEN']);
  });

  it('pins every action it uses to a commit', () => {
    const actions = [...imageWorkflow.matchAll(/uses: ([^.\s][^\s]*)/g)].map((match) => match[1]);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action).toMatch(/@[0-9a-f]{40}$/);
  });
});
