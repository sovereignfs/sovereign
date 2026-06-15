import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { defineConfig } from 'tsup';

const SRC = 'src';
const DIST = 'dist';

/** Recursively collect every file under `dir`. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Ship the externalised CSS into `dist/` so a published package resolves its
 * `.css` imports without `src/` (Task 0.5.07; deferred from 0.3.07).
 *
 * Two rules, matching how each kind of CSS is consumed:
 *   - CSS Modules are imported from the bundled `dist/index.js` as flat
 *     specifiers (esbuild keeps `./Button.module.css` verbatim from source), so
 *     they must land at `dist/<basename>`. The per-component
 *     `<Component>.module.css` convention keeps basenames unique; we assert that
 *     so a future collision fails the build instead of silently overwriting.
 *   - Token CSS is consumed via the package `exports` map and `@import`s its
 *     siblings (`tokens.css` → `./tokens/primitives.css`), so it must keep its
 *     relative structure under `dist/`.
 */
function copyCssToDist(): void {
  const cssFiles = walk(SRC).filter((f) => extname(f) === '.css');
  const seen = new Map<string, string>();

  for (const src of cssFiles) {
    const rel = relative(SRC, src);
    const isModule = src.endsWith('.module.css');
    const dest = isModule ? join(DIST, basename(src)) : join(DIST, rel);

    if (isModule) {
      const prior = seen.get(dest);
      if (prior) {
        throw new Error(
          `[ui build] CSS Module basename collision: "${prior}" and "${rel}" ` +
            `both map to ${dest}. Rename one — bundled imports are flat by basename.`,
        );
      }
      seen.set(dest, rel);
    }

    if (!existsSync(dirname(dest))) mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // CSS Modules and token CSS are left external — tsup/esbuild can't scope-hash
  // CSS Modules. The consuming app (via transpilePackages in v1, its own bundler
  // when installed from npm) processes the CSS. `onSuccess` copies the .css into
  // dist/ so the published package's imports resolve; `publishConfig` (in
  // package.json) repoints exports at dist/ on publish.
  external: [/\.css$/, 'react', 'react-dom', 'react/jsx-runtime'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  onSuccess: async () => {
    copyCssToDist();
  },
});
