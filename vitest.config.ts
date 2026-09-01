import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Forces oxc's own JSX transform (Vite's default transformer as of this
  // version) regardless of which tsconfig.json Vite resolves as "nearest"
  // for a given file — found needing this while adding the first-ever .tsx
  // test under runtime/: that directory's own tsconfig.json sets "jsx":
  // "preserve" (correct for Next.js's own SWC build pipeline, which this
  // test runner has nothing to do with), so oxc left JSX syntax untouched
  // and Vite's plain-JS import-analysis pass then failed on it ("Failed to
  // parse source... invalid JS syntax", pointing at raw JSX — the same
  // esbuild-authored error message even though esbuild wasn't actually the
  // transformer in play; setting `esbuild.jsx` here instead has no effect
  // and is silently ignored whenever both are configured, confirmed
  // directly against this toolchain before landing on the `oxc` option).
  // packages/ui's tests never hit this only because packages/ui/tsconfig.json
  // happens to set "jsx": "react-jsx" — an accident of which package a test
  // lives in, not a deliberate setting for this test runner. 'automatic'
  // matches that same react-jsx behavior (the modern JSX transform, no
  // `import React` needed) for every package uniformly, independent of its
  // own tsconfig.
  oxc: { jsx: 'automatic' },
  resolve: {
    alias: {
      // Matches runtime/tsconfig.json's own `"@/*": ["./*"]` mapping. The
      // three platform plugins (console, launcher, account) are composed
      // into runtime/app at build time and use `@/src/...` to reach
      // runtime/src directly (an allowed exception to the plugin SDK
      // boundary rule, unlike third-party plugins) — this alias is what
      // lets their *source*-tree tests (plugins/<id>/app/__tests__/) resolve
      // those imports without needing the composed copy under
      // runtime/app/(platform)/(plugins)/, which vitest's include patterns
      // deliberately never run.
      '@': fileURLToPath(new URL('./runtime', import.meta.url)),
    },
  },
  test: {
    // Pre-creates the `drizzle` schema once, before any test file starts —
    // see the file's own doc comment for the concurrent-CREATE-SCHEMA race
    // this avoids. No-ops entirely when TEST_DATABASE_URL is unset.
    globalSetup: ['./packages/db/src/__tests__/global-setup.pg.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      // Playwright specs live in __tests__/e2e/ — Vitest must not pick them up.
      // The include patterns below only match *.test.{ts,tsx} so .spec.ts would
      // not match anyway, but this explicit exclude documents the intent.
      '__tests__/e2e/**',
      // Playwright visual-regression specs (RFC 0059) — same reasoning as
      // __tests__/e2e/** above. Deliberately named *.visual.spec.ts, not
      // RFC 0010's reserved *.visual.test.tsx — that suffix would match the
      // *.test.{ts,tsx} include globs below and Vitest would try (and fail)
      // to run a Playwright spec as a unit test. See docs/testing-visual.md.
      '__tests__/visual/**',
      'packages/ui/__tests__/visual/**',
    ],
    include: [
      // Unit / component / integration tests inside each package or app.
      // Tests sit in per-directory __tests__/ folders next to the source they cover.
      'packages/**/__tests__/**/*.test.{ts,tsx}',
      'apps/**/__tests__/**/*.test.{ts,tsx}',
      // runtime/src only, including nested __tests__ dirs (e.g.
      // runtime/src/portability/__tests__/) — the generated copies under
      // runtime/app/(platform)/(plugins)/ are intentionally excluded by
      // anchoring to runtime/src/.
      'runtime/src/**/__tests__/**/*.test.{ts,tsx}',
      // The narrow exception to the runtime/src/-only rule above: @modal's
      // own hand-written chrome files (layout.tsx et al. — see that
      // directory's .gitignore for the full list) sit inside the otherwise
      // fully-generated runtime/app/(platform)/(plugins)/ tree with no other
      // path to automated coverage. Anchored to the literal @modal/__tests__
      // segment so it can never match a generated overlay interception copy
      // (@modal/(.)<routePrefix>/...), which has no __tests__ dir of its own.
      // The (platform)/(plugins) parens must be escaped — vitest's glob
      // engine (tinyglobby) otherwise parses bare `(...)` as extglob group
      // syntax and silently matches nothing, confirmed directly against the
      // library before settling on this pattern.
      'runtime/app/\\(platform\\)/\\(plugins\\)/@modal/__tests__/**/*.test.{ts,tsx}',
      // Plugin source trees. Only the source tree under plugins/ is matched —
      // the composed copies live under runtime/app/(platform)/(plugins)/ and
      // are not covered by any include pattern, so they are never double-run.
      'plugins/**/__tests__/**/*.test.{ts,tsx}',
      // Repo-level scripts and the sv CLI.
      'scripts/__tests__/**/*.test.{ts,tsx}',
      'bin/__tests__/**/*.test.{ts,tsx}',
      // The public plugin registry index (registry/plugins.json validation).
      'registry/__tests__/**/*.test.{ts,tsx}',
      // Root __tests__/ tree: cross-service integration tests. e2e and
      // visual specs also live under __tests__/ but use *.spec.ts, which
      // this pattern doesn't match — see the excludes above.
      '__tests__/**/*.test.{ts,tsx}',
    ],
    // Default to node; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` pragma at the top of the file.
    environment: 'node',
    css: {
      // Resolve CSS Module class names to their literal names so component
      // tests can assert on them (e.g. styles.ghost === 'ghost').
      modules: { classNameStrategy: 'non-scoped' },
    },
  },
});
