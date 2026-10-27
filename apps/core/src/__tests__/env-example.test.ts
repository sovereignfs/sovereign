import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { config } from '../config';

const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

describe('.env.example', () => {
  it('lists every variable core declares, and no other', () => {
    const listed = example
      .split('\n')
      .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined)
      .sort();
    const declared = config
      .describe()
      .map((row) => row.variable)
      .sort();
    expect(listed).toEqual(declared);
  });

  it('gives no secret a value', () => {
    for (const row of config.describe().filter((r) => r.secret)) {
      expect(example).toMatch(new RegExp(`^${row.variable}=$`, 'm'));
    }
  });

  it('mentions the _FILE form of every secret', () => {
    for (const row of config.describe().filter((r) => r.secret)) {
      expect(example).toContain(row.fileVariable);
    }
  });
});
