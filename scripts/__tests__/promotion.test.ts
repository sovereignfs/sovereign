/** The promotion pull request's title names what it carries, and says Release only when all of it will be tagged. */
import { describe, expect, it } from 'vitest';
import {
  UNITS,
  areaOf,
  changedVersions,
  promotionBody,
  promotionTitle,
  type Change,
} from '../lib/promotion';

const unit = (slug: string | null) => {
  const found = UNITS.find((u) => u.slug === slug);
  if (!found) throw new Error(String(slug));
  return found;
};
const change = (slug: string | null, from: string, to: string): Change => ({
  unit: unit(slug),
  from,
  to,
});
const none = new Set<string>();

describe('the promotion title', () => {
  it('is the platform version by default, when no version changed', () => {
    expect(promotionTitle([], '0.97.0', none)).toBe('v0.97.0');
    expect(promotionTitle([], '0.97.0', new Set(['v0.97.0']))).toBe('Release v0.97.0');
  });

  it('names only a package when only a package changed', () => {
    expect(promotionTitle([change('sdk', '2.1.0', '2.2.0')], '0.97.0', none)).toBe('sdk-v2.2.0');
  });

  it('names the platform first, then each published package, and leaves private ones to the body', () => {
    const changes = [
      change(null, '0.97.0', '0.98.0'),
      change('core', '0.63.0', '0.64.0'),
      change('ui', '0.96.1', '0.97.0'),
      change('mailer', '0.6.0', '0.6.1'),
    ];
    expect(promotionTitle(changes, '0.98.0', none)).toBe('v0.98.0, ui-v0.97.0');
  });

  it('starts with Release only when every version it names will be tagged', () => {
    const changes = [change(null, '0.97.0', '0.98.0'), change('ui', '0.96.1', '0.97.0')];
    expect(promotionTitle(changes, '0.98.0', new Set(['v0.98.0', 'ui-v0.97.0']))).toBe(
      'Release v0.98.0, ui-v0.97.0',
    );
    expect(promotionTitle(changes, '0.98.0', new Set(['ui-v0.97.0']))).toBe('v0.98.0, ui-v0.97.0');
  });
});

describe('the promotion body', () => {
  it('lists every version that changed, and whether merging publishes it', () => {
    const body = promotionBody(
      [change('ui', '0.96.1', '0.97.0'), change('core', '0.63.0', '0.64.0')],
      [],
      new Set(['ui-v0.97.0']),
    );
    expect(body).toContain('| `ui-v0.97.0` | `0.96.1` | yes |');
    expect(body).toContain('| `core-v0.64.0` | `0.63.0` | never (not published) |');
  });

  it('groups commits by the part of the repository most of their files are in', () => {
    const body = promotionBody(
      [],
      [
        {
          subject: 'feat(ui): a',
          files: ['packages/ui/src/a.tsx', 'packages/ui/src/b.tsx', 'docs/x.md'],
        },
        { subject: 'fix(core): b', files: ['apps/core/src/x.ts'] },
      ],
      none,
    );
    expect(body).toMatch(/### @sovereignfs\/ui\n\n- feat\(ui\): a/);
    expect(body).toMatch(/### Core\n\n- fix\(core\): b/);
    expect(body).toContain('No version changed.');
  });

  it('knows the areas', () => {
    expect(areaOf('tools/create/src/app.ts')).toBe('Toolkit');
    expect(areaOf('contracts/env.md')).toBe('Contracts');
    expect(areaOf('README.md')).toBe('Documentation');
    expect(areaOf('.github/workflows/ci.yml')).toBe('Repository');
  });
});

describe('the versions that changed', () => {
  it('are the units whose version differs between main and develop', () => {
    const versions: Record<string, Record<string, string>> = {
      main: { '.': '0.97.0', 'packages/ui': '0.96.1' },
      develop: { '.': '0.97.0', 'packages/ui': '0.97.0', 'packages/storage': '0.1.0' },
    };
    const changes = changedVersions((ref, dir) => versions[ref]?.[dir]);
    expect(changes.map(({ unit: u, from, to }) => [u.slug, from, to])).toEqual([
      ['ui', '0.96.1', '0.97.0'],
      ['storage', undefined, '0.1.0'],
    ]);
  });

  it('cover every workspace package that has a version of its own', async () => {
    const { readdirSync, existsSync } = await import('node:fs');
    for (const dir of readdirSync('packages')) {
      if (dir === 'tsconfig' || !existsSync(`packages/${dir}/package.json`)) continue;
      expect(
        UNITS.some((u) => u.dir === `packages/${dir}`),
        dir,
      ).toBe(true);
    }
  });
});
