/** A promotion's title decides what merging it publishes, so it is checked against the code before the merge. */
import { describe, expect, it } from 'vitest';
import { changelogSection, checkTitle, parseTitle, planOf } from '../lib/release';

const versions: Record<string, string> = {
  '.': '0.98.0',
  'apps/core': '0.64.0',
  'tools/cli': '0.12.0',
  'packages/ui': '0.97.0',
  'packages/sdk': '2.1.0',
};
const versionAt = (dir: string) => versions[dir];
const tagged = new Set(['sdk-v2.1.0']);
const isTagged = (id: string) => tagged.has(id);
const check = (title: string) => checkTitle(title, versionAt, isTagged);

describe('a promotion title', () => {
  it('is read as Release or not, with its versions, and without GitHub’s pull request number', () => {
    expect(parseTitle('Release v0.98.0, ui-v0.97.0')).toEqual({
      release: true,
      ids: ['v0.98.0', 'ui-v0.97.0'],
    });
    expect(parseTitle('cli-v0.12.0 (#35)')).toEqual({ release: false, ids: ['cli-v0.12.0'] });
  });

  it('passes when every version is the code’s, and plans what merging publishes', () => {
    const checked = check('Release v0.98.0, cli-v0.12.0, ui-v0.97.0');
    expect(checked.problems).toEqual([]);
    expect(planOf(checked.targets)).toEqual({
      image: 'v0.98.0',
      cli: 'cli-v0.12.0',
      packages: ['ui-v0.97.0'],
      // The design system's Storybook goes out with it.
      storybook: 'ui-v0.97.0',
    });
    expect(planOf(check('Release cli-v0.12.0').targets).storybook).toBeNull();
  });

  it('publishes nothing without Release, but is still held to the code', () => {
    expect(check('ui-v0.97.0').problems).toEqual([]);
    expect(check('ui-v0.96.0').problems).toEqual([
      'ui-v0.96.0: packages/ui/package.json is 0.97.0, not 0.96.0.',
    ]);
  });

  it('refuses a Release of something already tagged, unpublished, unknown or malformed', () => {
    expect(check('Release sdk-v2.1.0').problems[0]).toContain('tagged already');
    expect(check('Release core-v0.64.0').problems[0]).toContain('not published');
    expect(check('Release nope-v1.0.0').problems[0]).toContain('there is no "nope"');
    expect(check('Release version 1').problems[0]).toContain('is not a version');
    expect(check('Release').problems[0]).toContain('names no version');
    expect(check('Release ui-v0.97.0, ui-v0.97.0').problems).toEqual([
      'ui-v0.97.0 is named twice.',
    ]);
  });

  it('may name an already tagged version when it releases nothing', () => {
    expect(check('sdk-v2.1.0').problems).toEqual([]);
  });
});

describe('a changelog section', () => {
  const text = [
    '# Changelog',
    '',
    '## [0.12.0] - 2026-11-15',
    '',
    '### Added',
    '',
    '- A thing.',
    '',
    '## [0.11.0] - 2026-11-08',
    '',
    '- Older.',
  ].join('\n');

  it('is the text under the version’s heading, up to the next', () => {
    expect(changelogSection(text, '0.12.0')).toBe('### Added\n\n- A thing.');
    expect(changelogSection(text, '0.11.0')).toBe('- Older.');
  });

  it('treats the version as text, not as a pattern', () => {
    expect(changelogSection(text, '0.12.')).toBeUndefined();
    expect(changelogSection(text, '0.1.0')).toBeUndefined();
    expect(changelogSection(text, '.*')).toBeUndefined();
    expect(changelogSection('## [1x2y3] - 2026-01-01\n\n- a', '1.2.3')).toBeUndefined();
  });

  it('is missing for a version with no heading, and does not match a longer version', () => {
    expect(changelogSection(text, '0.13.0')).toBeUndefined();
    expect(changelogSection(text, '0.1.0')).toBeUndefined();
  });
});
