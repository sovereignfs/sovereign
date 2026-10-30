/**
 * `docs/specs/design-system.md` makes promises an app relies on. Most can be checked against the package itself, so the ones that
 * can are checked here: a promise that has quietly stopped being true is worse than none.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const spec = read('docs/specs/design-system.md');
const index = read('packages/ui/src/index.ts');
const manifest = JSON.parse(read('packages/ui/package.json')) as {
  dependencies?: object;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  publishConfig: { exports: Record<string, unknown> };
};

const files = (dir: string): string[] =>
  readdirSync(path.join(root, dir)).flatMap((entry) => {
    const file = path.join(dir, entry);
    return statSync(path.join(root, file)).isDirectory() ? files(file) : [file];
  });
const sources = files('packages/ui/src').filter(
  (file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$|__tests__/.test(file),
);

/** The stable list: every code span in the §3 bullets that name exports. */
const stableList = () => {
  const section = /\*\*Stable\.\*\* Exactly these:([\s\S]*?)\*\*Experimental\.\*\*/.exec(spec);
  return [...(section?.[1] ?? '').matchAll(/`([A-Za-z_]+)`/g)].map((match) => String(match[1]));
};

describe('the stable list', () => {
  it('names only what the package exports', () => {
    const names = stableList();
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) expect(index, name).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('holds the components the guide’s readers were told are stable', () => {
    expect(stableList()).toEqual(
      expect.arrayContaining(['Button', 'Card', 'FormField', 'Icon', 'Input', 'StatusBadge']),
    );
  });
});

describe('the public stylesheets', () => {
  it('are the ones the package publishes', () => {
    const published = Object.keys(manifest.publishConfig.exports)
      .filter((entry) => entry.endsWith('.css'))
      .map((entry) => entry.replace(/^\.\//, ''));
    expect(published.length).toBeGreaterThan(0);
    for (const entry of published) expect(spec, entry).toContain(path.basename(entry));
  });
});

describe('what using a component needs', () => {
  it('exports one provider, the one the specification names', () => {
    const providers = [...index.matchAll(/\b([A-Z][A-Za-z]*Provider)\b/g)].map((match) => match[1]);
    expect([...new Set(providers)]).toEqual(['ToastProvider']);
    expect(spec).toContain('`ToastProvider`');
  });

  it('fetches nothing', () => {
    for (const file of sources) expect(read(file), file).not.toMatch(/\bfetch\(/);
  });
});

describe('dependencies', () => {
  it('has no runtime dependencies', () => {
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it('peers on React 19, and anything else is optional', () => {
    expect(manifest.peerDependencies.react).toMatch(/^\^19\./);
    expect(manifest.peerDependencies['react-dom']).toMatch(/^\^19\./);
    for (const name of Object.keys(manifest.peerDependencies)) {
      if (name === 'react' || name === 'react-dom') continue;
      expect(manifest.peerDependenciesMeta?.[name]?.optional, name).toBe(true);
    }
  });

  it('imports no other Sovereign package and no framework', () => {
    const allowed = /^(react|react-dom|react\/jsx-runtime|@dnd-kit\/[a-z]+)(\/|$)/;
    for (const file of sources) {
      const imports = [...read(file).matchAll(/from '([^.'][^']*)'/g)].map((match) =>
        String(match[1]),
      );
      for (const name of imports) expect(name, file).toMatch(allowed);
    }
  });
});

describe('the one breakpoint', () => {
  it('is the constant the specification names', () => {
    expect(read('packages/ui/src/hooks/useIsMobile.ts')).toContain('MOBILE_BREAKPOINT_PX = 768');
    expect(spec).toContain('`768px`');
  });

  it('has no exception: every component uses the one breakpoint', () => {
    const styles = files('packages/ui/src/components').filter((file) =>
      file.endsWith('.module.css'),
    );
    expect(styles.length).toBeGreaterThan(50);
    const others = styles.flatMap((file) =>
      [...read(file).matchAll(/@media[^{]*\((?:max|min)-width:\s*([0-9.]+)(?:px|rem|em)\)/g)]
        .filter((match) => match[1] !== '768')
        .map((match) => `${path.basename(file, '.module.css')} ${String(match[1])}`),
    );
    expect(others).toEqual([]);
  });
});

describe('the guide', () => {
  it('sends a reader here for what is binding, and promises nothing this does not', () => {
    const guide = read('docs/design-system.md');
    expect(guide).toContain('specs/design-system.md');
    expect(guide).not.toMatch(/breaking changes require a major bump/);
    expect(guide).not.toMatch(/React 18\+/);
    expect(guide).not.toMatch(/SovereignUIRoot/);
  });
});
