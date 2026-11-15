/** The one release model for apps: the title names the version, Release tags and publishes it, and the changelog holds its notes. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AGENT_TRAILERS,
  changelogSection,
  checkTitle,
  isPrefix,
  tagOf,
  trailerProblems,
} from './release.js';

const facts = { version: '1.2.0', prefix: '', tagged: false, hasNotes: true };

describe('an app promotion title', () => {
  it('names the version, and says Release when merging publishes it', () => {
    expect(checkTitle('v1.2.0', facts)).toEqual({ release: false, tag: 'v1.2.0', problems: [] });
    expect(checkTitle('Release v1.2.0', facts)).toEqual({
      release: true,
      tag: 'v1.2.0',
      problems: [],
    });
    expect(checkTitle('Release v1.2.0 (#12)', facts).problems).toEqual([]);
  });

  it('takes the prefix of an app in a folder of a larger repository', () => {
    expect(checkTitle('Release web-v1.2.0', { ...facts, prefix: 'web-' }).problems).toEqual([]);
    expect(checkTitle('v1.2.0', { ...facts, prefix: 'web-' }).problems[0]).toContain('web-v1.2.0');
    expect(tagOf('web-', '1.2.0')).toBe('web-v1.2.0');
    expect(isPrefix('web-')).toBe(true);
    expect(isPrefix('web')).toBe(false);
    expect(isPrefix('')).toBe(true);
  });

  it('is refused when it names another version, none, a tagged one, or one with no notes', () => {
    expect(checkTitle('v1.1.0', facts).problems[0]).toContain('the app is at 1.2.0');
    expect(checkTitle('Release', facts).problems[0]).toContain('names no version');
    expect(checkTitle('Release v1.2.0', { ...facts, tagged: true }).problems[0]).toContain(
      'tagged already',
    );
    expect(checkTitle('Release v1.2.0', { ...facts, hasNotes: false }).problems[0]).toContain(
      'no section',
    );
    // Without Release nothing is tagged, so a tagged version or missing notes do not matter.
    expect(checkTitle('v1.2.0', { ...facts, tagged: true, hasNotes: false }).problems).toEqual([]);
  });
});

describe('an app changelog section', () => {
  const text =
    '# Changelog\n\n## [1.2.0] - 2026-11-15\n\n### Fixed\n\n- A thing.\n\n## [1.1.0] - 2026-11-01\n\n- Older.\n';
  it('is the text under the version’s heading, as text and not a pattern', () => {
    expect(changelogSection(text, '1.2.0')).toBe('### Fixed\n\n- A thing.');
    expect(changelogSection(text, '1.1.0')).toBe('- Older.');
    expect(changelogSection(text, '1.3.0')).toBeUndefined();
    expect(changelogSection(text, '.*')).toBeUndefined();
  });
});

describe('agent trailers', () => {
  it('accept each agent’s own and refuse one that names a model', () => {
    for (const trailer of AGENT_TRAILERS) expect(trailerProblems(`x\n\n${trailer}`)).toEqual([]);
    expect(
      trailerProblems('x\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'),
    ).toHaveLength(1);
    expect(trailerProblems('x\n\nCo-Authored-By: A Person <a@example.org>')).toEqual([]);
  });

  it('are the ones this repository’s commit-msg hook allows', () => {
    const hook = readFileSync(
      new URL('../../../scripts/lib/commit-message.ts', import.meta.url),
      'utf8',
    );
    for (const trailer of AGENT_TRAILERS) expect(hook).toContain(`'${trailer}'`);
  });
});
