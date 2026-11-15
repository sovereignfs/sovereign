/** npm create @sovereignfs app sync: an app's shared files written from the template, and --check failing on drift. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeApp, namesOf } from './app.js';
import { BEGIN, END, MANAGED, sharedSection, syncApp } from './sync.js';
import { SHARED_WORKFLOWS_REF } from './versions.js';

async function newApp(name = 'my-notes') {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'sv-sync-')), name);
  await writeApp(dir, namesOf(dir));
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
