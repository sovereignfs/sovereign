/** npm create @sovereignfs app sync: an app's shared files written from the template, and --check failing on drift. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeApp, namesOf } from './app.js';
import { PACKAGE_MANAGERS, type PackageManager } from './package-manager.js';
import { BEGIN, END, MANAGED, sharedSection, syncApp } from './sync.js';
import { SHARED_WORKFLOWS_REF } from './versions.js';

async function newApp(name = 'my-notes', packageManager?: PackageManager) {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'sv-sync-')), name);
  await writeApp(dir, namesOf(dir), undefined, packageManager ? { packageManager } : {});
  return dir;
}
const states = (results: { path: string; state: string }[]) =>
  Object.fromEntries(results.map((r) => [r.path, r.state]));

describe('an app made by create app', () => {
  it('already holds every shared file as sync would write it', async () => {
    const dir = await newApp();
    const results = await syncApp(dir, dir, { check: true });
    expect(results).toHaveLength(MANAGED.length);
    expect(results.every((r) => r.state === 'same')).toBe(true);
  });

  for (const manager of PACKAGE_MANAGERS)
    it(`made with ${manager} holds them as sync writes them for ${manager}`, async () => {
      const dir = await newApp('my-notes', manager);
      const results = await syncApp(dir, dir, { check: true });
      expect(results.filter((r) => r.state !== 'same')).toEqual([]);
    });

  it('made with npm before packageManager existed is synced as npm, not drifted', async () => {
    const dir = await newApp('my-notes', 'npm');
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.packageManager).toBeUndefined();
    expect((await syncApp(dir, dir, { check: true })).every((r) => r.state === 'same')).toBe(true);
    // The same app, called pnpm, would be told its guides name the wrong manager.
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ ...pkg, packageManager: 'pnpm@11.28.9' }),
    );
    expect(states(await syncApp(dir, dir, { check: true }))['AGENTS.md']).toBe('drifted');
  });

  it('calls the shared workflows at the pinned commit', async () => {
    const dir = await newApp();
    const promotion = readFileSync(path.join(dir, '.github/workflows/promotion.yml'), 'utf8');
    expect(promotion).toContain(`app-promotion.yml@${SHARED_WORKFLOWS_REF}`);
    expect(readFileSync(path.join(dir, '.github/workflows/release.yml'), 'utf8')).toContain(
      `app-release.yml@${SHARED_WORKFLOWS_REF}`,
    );
  });
});

describe('sync --check', () => {
  it('fails on a changed shared file, and sync puts it back', async () => {
    const dir = await newApp();
    writeFileSync(path.join(dir, 'RELEASING.md'), 'my own way\n');
    expect(states(await syncApp(dir, dir, { check: true }))['RELEASING.md']).toBe('drifted');
    expect(states(await syncApp(dir, dir, { check: false }))['RELEASING.md']).toBe('written');
    expect(readFileSync(path.join(dir, 'RELEASING.md'), 'utf8')).toContain(
      'A release is a promotion',
    );
  });

  it('compares the settings file by content, so a formatter cannot make it drift', async () => {
    const dir = await newApp();
    const file = path.join(dir, '.github/repository.json');
    writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))));
    expect(states(await syncApp(dir, dir, { check: true }))['.github/repository.json']).toBe(
      'same',
    );
  });

  it('looks only at the shared section of AGENTS.md, and keeps the app’s own sections', async () => {
    const dir = await newApp();
    const file = path.join(dir, 'AGENTS.md');
    const ours = readFileSync(file, 'utf8').replace(
      'Say here what it does and for whom.',
      'It keeps notes.',
    );
    writeFileSync(file, ours);
    expect(states(await syncApp(dir, dir, { check: true }))['AGENTS.md']).toBe('same');
    writeFileSync(file, ours.replace('Never merge a pull request', 'Merge a pull request'));
    expect(states(await syncApp(dir, dir, { check: true }))['AGENTS.md']).toBe('drifted');
    await syncApp(dir, dir, { check: false });
    const after = readFileSync(file, 'utf8');
    expect(after).toContain('It keeps notes.');
    expect(after).toContain('Never merge a pull request');
  });

  it('keeps an app’s own sections of CONTRIBUTING.md, such as how to set it up', async () => {
    const dir = await newApp();
    const file = path.join(dir, 'CONTRIBUTING.md');
    const ours = readFileSync(file, 'utf8').replace(
      BEGIN,
      `## Development setup\n\nRun pnpm install.\n\n${BEGIN}`,
    );
    writeFileSync(file, ours);
    expect(states(await syncApp(dir, dir, { check: true }))['CONTRIBUTING.md']).toBe('same');
  });

  it('says when AGENTS.md has no shared section, and sync adds one', async () => {
    const dir = await newApp();
    writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS.md\n\nOur own rules.\n');
    const checked = (await syncApp(dir, dir, { check: true })).find((r) => r.path === 'AGENTS.md');
    expect(checked).toMatchObject({ state: 'drifted', reason: 'has no shared section' });
    await syncApp(dir, dir, { check: false });
    const text = readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    expect(text.startsWith('# AGENTS.md\n\nOur own rules.')).toBe(true);
    expect(sharedSection(text)).toMatch(new RegExp(`^${BEGIN}[\\s\\S]*${END}$`));
  });

  it('leaves alone a file the app keeps as its own', async () => {
    const dir = await newApp();
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    pkg.sovereign.unmanaged = ['RELEASING.md'];
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
    writeFileSync(path.join(dir, 'RELEASING.md'), 'my own way\n');
    expect(states(await syncApp(dir, dir, { check: true }))['RELEASING.md']).toBe('unmanaged');
  });

  it('puts an app in a folder’s workflows at the repository’s root, with its folder and tag prefix', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sv-sync-repo-'));
    const dir = path.join(root, 'clients', 'web');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: '@sovereignfs/fjord-web',
        version: '1.0.0',
        sovereign: { tagPrefix: 'web-', requiredChecks: ['web'] },
      }),
    );
    await syncApp(dir, root, { check: false });
    const promotion = readFileSync(path.join(root, '.github/workflows/promotion.yml'), 'utf8');
    expect(promotion).toContain("directory: 'clients/web'");
    expect(promotion).toContain("tag-prefix: 'web-'");
    const settings = JSON.parse(readFileSync(path.join(root, '.github/repository.json'), 'utf8'));
    const checks = settings.rulesets[0].rules.find(
      (r: { type: string }) => r.type === 'required_status_checks',
    );
    expect(checks.parameters.required_status_checks).toEqual([
      { context: 'Promotion / Promotion title' },
      { context: 'web' },
    ]);
    expect(readFileSync(path.join(dir, 'RELEASING.md'), 'utf8')).toContain('Releasing Fjord Web');
  });
});

describe('a repository of several components', () => {
  function repo() {
    const root = mkdtempSync(path.join(tmpdir(), 'sv-sync-several-'));
    writeFileSync(
      path.join(root, 'sovereign.json'),
      JSON.stringify({
        name: 'fjord',
        create: '0.14.0',
        requiredChecks: ['CI'],
        components: [
          {
            name: 'cli',
            version: 'Cargo.toml',
            tagPrefix: 'fjord-cli-',
            changelog: 'crates/cli/CHANGELOG.md',
            publish: 'fjord-cli-release.yml',
          },
          {
            name: 'web',
            version: 'clients/web/package.json',
            tagPrefix: 'web-',
            changelog: 'clients/web/CHANGELOG.md',
            publish: 'web-release.yml',
          },
        ],
      }),
    );
    return root;
  }

  it('keeps its documents at the root and releases each component with its own publish workflow', async () => {
    const root = repo();
    await syncApp(root, root, { check: false });
    expect(readFileSync(path.join(root, 'RELEASING.md'), 'utf8')).toContain(
      'releases several components',
    );
    const release = readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
    expect(release).toContain(`app-release.yml@${SHARED_WORKFLOWS_REF}`);
    expect(release).toContain('uses: ./.github/workflows/fjord-cli-release.yml');
    expect(release).toContain("tag: ${{ fromJSON(needs.plan.outputs.tags || '{}')['web'] }}");
    const settings = JSON.parse(readFileSync(path.join(root, '.github/repository.json'), 'utf8'));
    const checks = settings.rulesets[0].rules.find(
      (r: { type: string }) => r.type === 'required_status_checks',
    );
    expect(checks.parameters.required_status_checks).toEqual([
      { context: 'Promotion / Promotion title' },
      { context: 'CI' },
    ]);
    expect((await syncApp(root, root, { check: true })).every((r) => r.state === 'same')).toBe(
      true,
    );
  });
});
