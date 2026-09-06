import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scaffoldPlugin } from '../helpers';

/**
 * `sv plugin new` (bin/helpers.ts) and `npm create @sovereignfs/plugin`
 * (packages/create-plugin) carry two copies of the plugin skeleton. The
 * TypeScript 6 migration fixed one and missed the other, so a freshly
 * scaffolded in-repo plugin failed its own typecheck on `baseUrl` (TS5101).
 * These assertions pin the platform-version-sensitive parts of the
 * skeleton `sv plugin new` emits; the create-plugin template is checked by
 * the string assertions at the bottom.
 */

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function scaffold(workspaceDeps: boolean) {
  dir = mkdtempSync(join(tmpdir(), 'sv-scaffold-'));
  const out = scaffoldPlugin({
    id: 'io.example.smoke',
    name: 'Smoke',
    description: 'test',
    routePrefix: '/smoke',
    outDir: dir,
    workspaceDeps,
  });
  const read = (rel: string) =>
    JSON.parse(readFileSync(join(out, rel), 'utf8')) as Record<string, unknown>;
  return { tsconfig: read('tsconfig.json'), pkg: read('package.json'), files: readdirSync(out) };
}

describe('sv plugin new skeleton', () => {
  it('emits a tsconfig without baseUrl (deprecated in TypeScript 6, removed in 7)', () => {
    const { tsconfig } = scaffold(true);
    expect(tsconfig.extends).toBe('@sovereignfs/tsconfig/nextjs.json');
    expect(tsconfig.compilerOptions).toBeUndefined();
  });

  it('ships the CSS Modules declaration and a typecheck script, like the example plugins', () => {
    const { tsconfig, pkg, files } = scaffold(true);
    expect(files).toContain('css-modules.d.ts');
    expect(tsconfig.include).toContain('css-modules.d.ts');
    expect((pkg.scripts as Record<string, string>).typecheck).toBe('tsc --noEmit');
  });

  it('uses workspace/catalog references inside the monorepo', () => {
    const { pkg } = scaffold(true);
    const dev = pkg.devDependencies as Record<string, string>;
    expect(dev.typescript).toBe('catalog:');
    expect(dev['@sovereignfs/tsconfig']).toBe('workspace:*');
  });

  it('pins TypeScript to the 6.x line standalone, never `latest` (7.x)', () => {
    const { pkg } = scaffold(false);
    const dev = pkg.devDependencies as Record<string, string>;
    expect(dev.typescript).toBe('^6.0.0');
    const deps = pkg.dependencies as Record<string, string>;
    expect(deps.next).toBe('latest');
  });
});

describe('create-plugin (npm create) template stays in step', () => {
  const source = readFileSync(join(__dirname, '../../packages/create-plugin/src/index.ts'), 'utf8');

  it('has no baseUrl, pins TypeScript to 6.x, and ships css-modules.d.ts', () => {
    expect(source).not.toContain('baseUrl');
    expect(source).toContain("typescript: '^6.0.0'");
    expect(source).toContain("'css-modules.d.ts'");
  });
});
