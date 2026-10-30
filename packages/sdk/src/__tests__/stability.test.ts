import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EXPERIMENTAL, STABLE } from '../stability';

// The next adapter imports `next`, which these tests do not need to run.
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ toString: () => '' }) }));
vi.mock('next/navigation', () => ({ redirect: () => undefined }));

const root = path.join(import.meta.dirname, '../../../..');
const spec = readFileSync(path.join(root, 'docs/specs/sdk.md'), 'utf8');
const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8'),
) as {
  version: string;
  sovereign: { core: string };
};

const entries = {
  '.': await import('../index'),
  './next': await import('../next/index'),
  './testing': await import('../testing/index'),
} as const;

describe('which exports are stable (sdk §12)', () => {
  it.each(Object.keys(entries) as (keyof typeof entries)[])(
    'names every export of %s as stable or experimental, and nothing that is not exported',
    (entry) => {
      const listed = [...STABLE[entry], ...EXPERIMENTAL[entry]].sort();
      expect(Object.keys(entries[entry]).sort()).toEqual(listed);
    },
  );

  it('makes stable exactly what the specification says: createSovereign and the error types of §6', () => {
    const section = spec.slice(
      spec.indexOf('## 6. Failure'),
      spec.indexOf('## 7. Version support'),
    );
    const errors = [...section.matchAll(/^\| `(\w+Error)`/gm)].map((match) => match[1] as string);
    expect(errors.length).toBeGreaterThanOrEqual(5);
    expect([...STABLE['.']].sort()).toEqual(
      ['SovereignError', 'createSovereign', ...errors].sort(),
    );
    expect(spec).toMatch(/the stable exports are `createSovereign`, the error types of §6/);
  });

  it('keeps the experimental ones out of the stable list, and lists nothing twice', () => {
    const all = [...Object.values(STABLE).flat(), ...Object.values(EXPERIMENTAL).flat()];
    for (const entry of Object.keys(STABLE) as (keyof typeof STABLE)[]) {
      for (const name of EXPERIMENTAL[entry]) expect(STABLE[entry]).not.toContain(name);
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('which cores a release supports (sdk §12)', () => {
  it('is stated in the package, as a range that starts at a version', () => {
    expect(manifest.sovereign.core).toMatch(/^>=\d+\.\d+\.\d+$/);
  });

  it('is a range this repository’s own core is inside, and the README says it', () => {
    const core = JSON.parse(readFileSync(path.join(root, 'apps/core/package.json'), 'utf8')) as {
      version: string;
    };
    const parse = (version: string) => version.split('.').map(Number);
    const floor = parse(manifest.sovereign.core.slice(2));
    const have = parse(core.version);
    // The first part that differs decides, as semver compares.
    const differing = floor.findIndex((part, at) => part !== (have[at] ?? 0));
    expect(differing === -1 || (have[differing] ?? 0) > (floor[differing] ?? 0)).toBe(true);
    const readme = readFileSync(path.join(import.meta.dirname, '../../README.md'), 'utf8');
    expect(readme).toContain(manifest.sovereign.core);
  });
});
