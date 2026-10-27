/**
 * Shared packages work with no core present: standalone apps use them without ever
 * running core. The ESLint rule stops a package importing the core app; this stops
 * a package declaring it as a dependency, which is how the import would get in.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const packagesDir = path.join(root, 'packages');

type Manifest = Record<string, unknown> & { name?: string };

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    dir: entry.name,
    manifest: JSON.parse(
      readFileSync(path.join(packagesDir, entry.name, 'package.json'), 'utf8'),
    ) as Manifest,
  }));

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/** Anything that names the core app: its package, or a path into apps/core. */
function pointsAtCore(name: string, spec: string): boolean {
  return (
    name === '@sovereignfs/core' ||
    name.startsWith('@sovereignfs/core/') ||
    /(^|[/:])apps\/core(\/|$)/.test(spec)
  );
}

describe('shared packages do not depend on the core app', () => {
  it('finds the packages it is meant to check', () => {
    expect(packages.map((p) => p.dir)).toContain('config');
  });

  it.each(packages.map((p) => [p.dir, p.manifest] as const))('packages/%s', (_dir, manifest) => {
    const offenders: string[] = [];
    for (const field of DEPENDENCY_FIELDS) {
      const declared = (manifest[field] ?? {}) as Record<string, string>;
      for (const [name, spec] of Object.entries(declared)) {
        if (pointsAtCore(name, spec)) offenders.push(`${field}: ${name} -> ${spec}`);
      }
    }
    expect(offenders, 'a shared package must not depend on apps/core').toEqual([]);
  });
});

describe('pointsAtCore', () => {
  it('recognises the core package and a path into the core app', () => {
    expect(pointsAtCore('@sovereignfs/core', 'workspace:*')).toBe(true);
    expect(pointsAtCore('@sovereignfs/core/auth', '1.0.0')).toBe(true);
    expect(pointsAtCore('core-link', 'link:../../apps/core')).toBe(true);
    expect(pointsAtCore('x', 'file:../apps/core/src')).toBe(true);
  });

  it('does not mistake another package for it', () => {
    expect(pointsAtCore('@sovereignfs/config', 'workspace:*')).toBe(false);
    expect(pointsAtCore('@sovereignfs/core-utils', 'workspace:*')).toBe(false);
    expect(pointsAtCore('x', 'link:../../apps/corezone')).toBe(false);
  });
});
