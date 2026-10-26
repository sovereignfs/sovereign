import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDocLinks, PLANNED_TARGETS } from '../lib/doc-links';

let root: string;

function write(rel: string, content: string): void {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'doc-links-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('checkDocLinks', () => {
  it('accepts links to files and directories that exist', () => {
    write('a.md', '[b](docs/b.md) and [dir](docs/)\n');
    write('docs/b.md', '# B\n');
    expect(checkDocLinks(root, {})).toEqual([]);
  });

  it('reports a link to a missing file with its file and line', () => {
    write('a.md', 'first\n[gone](docs/gone.md)\n');
    expect(checkDocLinks(root, {})).toEqual([
      expect.objectContaining({ file: 'a.md', line: 2, target: 'docs/gone.md' }),
    ]);
  });

  it('resolves links relative to the file that contains them', () => {
    write('docs/a.md', '[up](../README.md)\n');
    write('README.md', '# readme\n');
    expect(checkDocLinks(root, {})).toEqual([]);
  });

  it('ignores the anchor part and links that are only an anchor', () => {
    write('a.md', '[x](b.md#section) and [y](#top)\n');
    write('b.md', '# B\n');
    expect(checkDocLinks(root, {})).toEqual([]);
  });

  it('ignores external links', () => {
    write('a.md', '[x](https://example.com/missing) [y](mailto:a@b.c)\n');
    expect(checkDocLinks(root, {})).toEqual([]);
  });

  it('ignores links inside fenced and inline code', () => {
    write('a.md', ['`[x](nope.md)`', '```md', '[y](nope.md)', '```', 'after'].join('\n'));
    expect(checkDocLinks(root, {})).toEqual([]);
  });

  it('accepts a planned target only while it is missing', () => {
    write('a.md', '[spec](spec/env.md)\n');
    expect(checkDocLinks(root, { 'spec/env.md': 'task 1.1' })).toEqual([]);
    expect(checkDocLinks(root, {})).toHaveLength(1);
  });

  it('accepts a planned directory written with a trailing slash', () => {
    write('docs/a.md', '[api](../spec/core-api/)\n');
    expect(checkDocLinks(root, { 'spec/core-api': 'task 10.1' })).toEqual([]);
  });

  it('does not scan dependencies or the not-yet-ported legacy files', () => {
    write('node_modules/x/README.md', '[bad](nope.md)\n');
    write('packages/ui/README.md', '[bad](nope.md)\n');
    write('docs/design-system.md', '[bad](nope.md)\n');
    expect(checkDocLinks(root, {})).toEqual([]);
  });

  it('plans only targets that a roadmap task will create', () => {
    expect(Object.keys(PLANNED_TARGETS).sort()).toEqual(['spec/core-api', 'spec/env.md']);
  });
});

describe('checkDocLinks on hostile or malformed input', () => {
  it('reports a malformed percent escape instead of throwing', () => {
    write('a.md', '[bad](100%.md)\n');
    expect(() => checkDocLinks(root, {})).not.toThrow();
    expect(checkDocLinks(root, {})).toEqual([expect.objectContaining({ target: '100%.md' })]);
  });

  it('accepts a malformed percent escape when the file really has that name', () => {
    write('a.md', '[ok](100%.md)\n');
    write('100%.md', '# x\n');
    expect(checkDocLinks(root, {})).toEqual([]);
  });

  it('does not follow a symlink loop', () => {
    write('docs/a.md', '[x](b.md)\n');
    write('docs/b.md', '# b\n');
    symlinkSync('..', path.join(root, 'docs', 'loop'));
    expect(() => checkDocLinks(root, {})).not.toThrow();
  });

  it('does not read documents behind a symlink that leaves the repository', () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'doc-links-outside-'));
    try {
      writeFileSync(path.join(outside, 'x.md'), '[bad](nope.md)\n');
      symlinkSync(outside, path.join(root, 'linked'));
      expect(checkDocLinks(root, {})).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('finishes quickly on a pathological line and reports it', () => {
    write('a.md', `${'['.repeat(60_000)}\n`);
    const started = Date.now();
    const findings = checkDocLinks(root, {});
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(findings).toEqual([expect.objectContaining({ file: 'a.md', line: 1 })]);
    expect(findings[0]?.reason).toContain('too long');
  });

  it('resolves a leading slash against the repository root, not the host filesystem', () => {
    write('a.md', '[ok](/docs/b.md) [bad](/etc/hosts)\n');
    write('docs/b.md', '# b\n');
    expect(checkDocLinks(root, {})).toEqual([expect.objectContaining({ target: '/etc/hosts' })]);
  });

  it('rejects a link that leaves the repository even if the target exists on this machine', () => {
    const sibling = `outside-${path.basename(root)}.md`;
    writeFileSync(path.join(root, '..', sibling), '# elsewhere\n');
    try {
      write('a.md', `[out](../${sibling})\n`);
      const findings = checkDocLinks(root, {});
      expect(findings).toEqual([expect.objectContaining({ target: `../${sibling}` })]);
      expect(findings[0]?.reason).toContain('outside the repository');
    } finally {
      rmSync(path.join(root, '..', sibling), { force: true });
    }
  });
});
