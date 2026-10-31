/**
 * The toolkit is released on its own tag, `cli-vX.Y.Z`: the image first, then `@sovereignfs/cli`, then `@sovereignfs/create`. This keeps
 * the workflow to the guards the other two have, and keeps what it publishes in step with the packages.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const workflow = read('.github/workflows/publish-cli.yml');
const packagesWorkflow = read('.github/workflows/publish.yml');
const imageWorkflow = read('.github/workflows/publish-image.yml');
const json = (file: string) => JSON.parse(read(file)) as Record<string, unknown>;

describe('the toolkit release workflow', () => {
  it('runs on its own tag, which neither of the other workflows runs on', () => {
    expect(workflow).toContain("- 'cli-v*.*.*'");
    expect(packagesWorkflow).not.toContain('cli-v');
    expect(imageWorkflow).not.toContain('cli-v');
  });

  it('publishes both packages, and they are the ones that are not private', () => {
    expect(workflow).toContain('pnpm --filter @sovereignfs/cli publish');
    expect(workflow).toContain('pnpm --filter @sovereignfs/create publish');
    for (const dir of ['cli', 'create']) {
      const manifest = json(`apps/${dir}/package.json`);
      expect(manifest.private, dir).not.toBe(true);
      expect(manifest.license).toBe('AGPL-3.0-or-later');
    }
  });

  it('keeps the two packages at one version, and the toolkit’s own version with them', () => {
    expect(json('apps/create/package.json').version).toBe(json('apps/cli/package.json').version);
    expect(read('apps/cli/src/release.ts')).toContain(
      `version: '${json('apps/cli/package.json').version as string}'`,
    );
  });

  it('puts the image before the packages, and create after the toolkit', () => {
    expect(workflow).toMatch(/npm:[\s\S]*needs: image/);
    expect(workflow.indexOf('--filter @sovereignfs/cli publish')).toBeLessThan(
      workflow.indexOf('--filter @sovereignfs/create publish'),
    );
  });

  it('runs the whole CI on the tagged commit before anything is published', () => {
    expect(workflow).toMatch(/validate:[\s\S]*uses: \.\/\.github\/workflows\/ci\.yml/);
    expect(workflow).toMatch(/image:[\s\S]*needs: validate/);
  });

  it('refuses a tagged commit that is not on main, and a tag that does not match both packages', () => {
    expect(
      workflow.match(/git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/g),
    ).toHaveLength(2);
    expect(
      workflow.match(/expects version \$expected, but apps\/\$dir\/package\.json/g),
    ).toHaveLength(2);
  });

  it('checks the version and the commit before it can log in or push, in the image job', () => {
    const login = workflow.indexOf('docker/login-action');
    expect(login).toBeGreaterThan(workflow.indexOf('expects version $expected'));
    expect(login).toBeGreaterThan(workflow.indexOf('git merge-base --is-ancestor'));
    expect(workflow.indexOf('docker/build-push-action')).toBeGreaterThan(login);
  });

  it('builds the toolkit before the image copies it in, for both architectures, by version and as latest, with no cache', () => {
    expect(workflow.indexOf('pnpm --filter @sovereignfs/cli build')).toBeLessThan(
      workflow.indexOf('docker/build-push-action'),
    );
    expect(workflow).toContain('context: apps/cli');
    expect(workflow).toContain('platforms: linux/amd64,linux/arm64');
    expect(workflow).toContain('${{ env.IMAGE }}:${{ steps.version.outputs.version }}');
    expect(workflow).toContain('${{ env.IMAGE }}:latest');
    expect(workflow).toContain('no-cache: true');
    expect(workflow).not.toContain('cache-from');
  });

  it('checks the tarballs and signs provenance, with each credential used in one place', () => {
    expect(workflow).toContain('pnpm packages:check');
    expect(workflow).toContain('--provenance');
    expect(workflow).toContain('id-token: write');
    expect(workflow.match(/secrets\.NPM_TOKEN/g)).toHaveLength(1);
    expect(workflow.match(/secrets\.GITHUB_TOKEN/g)).toHaveLength(1);
    expect(workflow.match(/secrets\.[A-Z_]+/g)).toHaveLength(2);
    expect(workflow.match(/packages: write/g)).toHaveLength(1);
  });

  it('installs without a cache, and pins every action to a commit', () => {
    expect(workflow).toMatch(/\.\/\.github\/actions\/setup\s+with:\s+cache: 'false'/);
    expect(workflow).toContain('package-manager-cache: false');
    const actions = [...workflow.matchAll(/uses: ([^.\s][^\s]*)/g)].map((match) => match[1]);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action).toMatch(/@[0-9a-f]{40}$/);
  });

  it('ships an image whose Dockerfile copies only the bundled toolkit', () => {
    expect(read('apps/cli/Dockerfile')).toContain('COPY dist/sv.mjs');
    expect(read('apps/cli/.dockerignore')).toBe('*\n!dist/sv.mjs\n');
  });
});
