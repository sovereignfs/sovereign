/** What a repository releases: an app from its package.json, or several components from sovereign.json. */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readReleases, versionIn } from './components.js';

describe('a version file', () => {
  it('is a package.json, or a Cargo.toml’s workspace version before its package version', () => {
    expect(versionIn('package.json', '{"version":"1.2.0"}')).toBe('1.2.0');
    expect(
      versionIn(
        'Cargo.toml',
        '[package]\nversion = "0.1.0"\n\n[workspace.package]\nversion = "0.6.0"\n',
      ),
    ).toBe('0.6.0');
    expect(
      versionIn(
        'crates/a/Cargo.toml',
        '[package]\nname = "a"\nversion = "0.2.0"\n[dependencies]\nversion = "9"\n',
      ),
    ).toBe('0.2.0');
    expect(versionIn('Cargo.toml', '[package]\nversion.workspace = true\n')).toBeUndefined();
  });
});

describe('the release settings', () => {
  it('are one component for an app, from its package.json', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sv-releases-'));
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: '@sovereignfs/notes',
        version: '1.0.0',
        devDependencies: { '@sovereignfs/create': '0.14.0' },
        sovereign: { requiredChecks: ['Check'] },
      }),
    );
    const releases = await readReleases(dir);
    expect(releases).toMatchObject({
      name: 'notes',
      file: 'package.json',
      create: '0.14.0',
      requiredChecks: ['Check'],
    });
    expect(releases.components).toEqual([
      {
        name: 'notes',
        version: 'package.json',
        tagPrefix: '',
        changelog: 'CHANGELOG.md',
        publish: 'publish.yml',
      },
    ]);
  });

  it('are refused when two components share a tag prefix', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sv-releases-'));
    const one = {
      name: 'a',
      version: 'a/package.json',
      tagPrefix: 'x-',
      changelog: 'a/CHANGELOG.md',
      publish: 'a.yml',
    };
    writeFileSync(
      path.join(dir, 'sovereign.json'),
      JSON.stringify({ name: 'r', components: [one, { ...one, name: 'b' }] }),
    );
    await expect(readReleases(dir)).rejects.toThrow('share a tag prefix');
  });
});
