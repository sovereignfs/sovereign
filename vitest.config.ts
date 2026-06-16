import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      // Unit / component / integration tests inside each package or app.
      // Tests sit in per-directory __tests__/ folders next to the source they cover.
      'packages/**/__tests__/**/*.test.{ts,tsx}',
      'apps/**/__tests__/**/*.test.{ts,tsx}',
      // runtime/src only — the generated copies under runtime/app/(platform)/(plugins)/
      // are intentionally excluded by anchoring to runtime/src/.
      'runtime/src/__tests__/**/*.test.{ts,tsx}',
      // Plugin source trees. Only the source tree under plugins/ is matched —
      // the composed copies live under runtime/app/(platform)/(plugins)/ and
      // are not covered by any include pattern, so they are never double-run.
      'plugins/**/__tests__/**/*.test.{ts,tsx}',
      // Repo-level scripts and the sv CLI.
      'scripts/__tests__/**/*.test.{ts,tsx}',
      'bin/__tests__/**/*.test.{ts,tsx}',
      // Root __tests__/ tree: cross-service integration, e2e, visual (future).
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
