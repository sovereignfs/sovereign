/**
 * The repository's licence policy, checked against the files: the shared packages are MPL-2.0 so
 * that apps under any licence can use them, core and the repository itself are AGPL-3.0-or-later,
 * and each package ships the text of the licence it declares.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

type Manifest = { name: string; license?: string; private?: boolean; files?: string[] };

const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const manifestOf = (dir: string) => JSON.parse(read(`${dir}/package.json`)) as Manifest;
const directories = (parent: string) =>
  readdirSync(path.join(root, parent), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(path.join(root, parent, entry.name, 'package.json')),
    )
    .map((entry) => `${parent}/${entry.name}`);

const MPL_HEADING = 'Mozilla Public License Version 2.0';
const AGPL_HEADING = 'GNU AFFERO GENERAL PUBLIC LICENSE';
const canonicalMpl = read('packages/config/LICENSE');

describe('packages are MPL-2.0', () => {
  const packages = directories('packages');

  it('finds the packages it is meant to check', () => {
    expect(packages).toEqual(
      expect.arrayContaining(['packages/ui', 'packages/bridge', 'packages/config']),
    );
  });

  it.each(packages)('%s declares MPL-2.0 and ships its text', (dir) => {
    expect(manifestOf(dir).license).toBe('MPL-2.0');
    expect(existsSync(path.join(root, dir, 'LICENSE')), `${dir}/LICENSE exists`).toBe(true);
    expect(read(`${dir}/LICENSE`).startsWith(MPL_HEADING)).toBe(true);
    // One text, everywhere: a package's LICENSE is the same file as the others.
    expect(read(`${dir}/LICENSE`)).toBe(canonicalMpl);
  });

  it.each(packages.filter((dir) => manifestOf(dir).private !== true))(
    '%s, which is published, lists LICENSE in its files',
    (dir) => {
      expect(manifestOf(dir).files).toContain('LICENSE');
    },
  );
});

describe('the design system keeps its notice for the icons derived from Lucide', () => {
  it('ships NOTICE, which carries the ISC licence', () => {
    expect(manifestOf('packages/ui').files).toContain('NOTICE');
    const notice = read('packages/ui/NOTICE');
    expect(notice).toContain('Lucide');
    expect(notice).toContain('ISC License');
  });
});

describe('core and the repository are AGPL-3.0-or-later', () => {
  it('declares it, and the root LICENSE is the AGPL text', () => {
    expect(manifestOf('.').license).toBe('AGPL-3.0-or-later');
    expect(read('LICENSE')).toContain(AGPL_HEADING);
  });

  it.each([...directories('apps'), ...directories('tools')])(
    '%s declares AGPL-3.0-or-later',
    (dir) => {
      expect(manifestOf(dir).license).toBe('AGPL-3.0-or-later');
    },
  );
});

describe('the README says the same', () => {
  it('names MPL-2.0 for packages and AGPL for core', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/`packages\/\*`\s*\|\s*MPL-2\.0/);
    expect(readme).toMatch(/`apps\/core`\s*\|\s*\[AGPL-3\.0-or-later\]/);
  });
});
