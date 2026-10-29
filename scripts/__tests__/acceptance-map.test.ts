import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

/** The numbered items of core-app §3.17, as the spec states them. */
function acceptanceItems(): string[] {
  const spec = read('docs/specs/core-app.md');
  const section = spec.slice(spec.indexOf('### 3.17 Phase 1 is done when'));
  const body = section.slice(0, section.indexOf('### 3.18'));
  return [...body.matchAll(/^(\d+)\. /gm)].map((match) => match[1] as string);
}

const titles = readdirSync(path.join(root, 'apps/e2e/tests'))
  .filter((file) => file.endsWith('.spec.ts'))
  .flatMap((file) => [
    ...read(`apps/e2e/tests/${file}`).matchAll(/test\(\s*[`'"](§3\.17\.(\d+))[:\s]/g),
  ])
  .map((match) => match[2] as string);

describe('Phase 1 acceptance (core-app §3.17)', () => {
  const items = acceptanceItems();

  it('reads the items from the spec', () => {
    expect(items.length).toBeGreaterThanOrEqual(12);
  });

  // Item 12 is the same behaviour on every database, which is the suite run once for each, not a test of its own.
  it.each(items.filter((item) => item !== '12'))(
    'item %s has a test of its own, named for it',
    (item) => {
      expect(titles).toContain(item);
    },
  );

  it('runs the whole suite on sqld, PostgreSQL and a SQLite file in CI (item 12)', () => {
    const workflow = read('.github/workflows/ci.yml');
    const job = workflow.slice(workflow.indexOf('  acceptance:'));
    const matrix = /dialect: \[([^\]]+)\]/.exec(job)?.[1] ?? '';
    expect(
      matrix
        .split(',')
        .map((name) => name.trim())
        .sort(),
    ).toEqual(['postgres', 'sqld', 'sqlite']);
    expect(job).toContain('pnpm e2e');
  });

  it('names no item that the spec does not have', () => {
    for (const title of titles) expect(items).toContain(title);
  });
});
