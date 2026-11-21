import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// better-auth's packages are pinned to one version (AGENTS.md, auth.md §11): core and the sign-in package must run one copy, or its
// errors, its context and its types split in two. Every workspace manifest that names one names it exactly, and all name the same.
const ROOT = path.join(import.meta.dirname, '../..');
const manifests = ['apps', 'packages', 'tools']
  .flatMap((group) =>
    readdirSync(path.join(ROOT, group)).map((dir) => path.join(ROOT, group, dir, 'package.json')),
  )
  .filter((file) => existsSync(file));

describe('better-auth', () => {
  it('is named at one exact version everywhere it is named', () => {
    const named: string[] = [];
    for (const file of manifests) {
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<
        string,
        Record<string, string> | undefined
      >;
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const [name, range] of Object.entries(manifest[field] ?? {})) {
          if (name === 'better-auth' || name.startsWith('@better-auth/')) named.push(range);
        }
      }
    }
    expect(named.length).toBeGreaterThan(3);
    expect(named.every((range) => /^\d+\.\d+\.\d+$/.test(range))).toBe(true);
    expect(new Set(named).size).toBe(1);
    // And an app made from the template names the same, in what `npm create @sovereignfs app` writes into its package.json.
    const versions = readFileSync(path.join(ROOT, 'tools/create/src/versions.ts'), 'utf8');
    expect(/'better-auth': '([^']+)'/.exec(versions)?.[1]).toBe(named[0]);
  });
});
