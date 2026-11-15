/**
 * Every published thing keeps a changelog, and a version is set with its section: the release notes are read from it when the version
 * is published (docs/releasing.md), so a version without one could not be released.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UNITS } from '../lib/promotion';
import { changelogPath, changelogSection } from '../lib/release';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const published = UNITS.filter((unit) => unit.published);

describe('the changelogs', () => {
  it.each(published.map((unit) => [unit.dir, unit]))(
    '%s has a section for its current version',
    (_dir, unit) => {
      const file = changelogPath(unit);
      expect(existsSync(path.join(root, file)), file).toBe(true);
      const { version } = JSON.parse(
        read(unit.dir === '.' ? 'package.json' : `${unit.dir}/package.json`),
      ) as {
        version: string;
      };
      expect(changelogSection(read(file), version), `${file} ## [${version}]`).toBeDefined();
    },
  );

  it.each(published.filter((unit) => unit.dir !== '.').map((unit) => [unit.dir]))(
    '%s ships its changelog in the npm package',
    (dir) => {
      const { files } = JSON.parse(read(`${dir}/package.json`)) as { files: string[] };
      expect(files).toContain('CHANGELOG.md');
    },
  );

  it('are dated, newest first', () => {
    for (const unit of published) {
      const dates = [
        ...read(changelogPath(unit)).matchAll(/^## \[[^\]]+\] - (\d{4}-\d{2}-\d{2})$/gm),
      ].map((m) => m[1] ?? '');
      expect(dates.length, changelogPath(unit)).toBeGreaterThan(0);
      expect([...dates].sort().reverse(), changelogPath(unit)).toEqual(dates);
    }
  });
});
