/**
 * `runtime/instrumentation.ts` was absent from `runtime/tsconfig.json`'s
 * `include`, so `pnpm typecheck` never looked at the runtime's entire boot path
 * — plugin migrations, boot-compat, notification broker init, scheduler start.
 * Four swapped-argument logger calls sat there emitting garbled JSON with a
 * green CI. `apps/auth/tsconfig.json` had the mirror-image gap for its own
 * `middleware.ts`.
 *
 * A Next.js app's top-level entry files are not reachable from `app/**`, so
 * nothing else drags them into the program: if the include list forgets one, it
 * is silently unchecked rather than reported as an error. This test enumerates
 * those entry files from disk and asserts each is actually listed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Ambient declarations, not program entry points — Next.js regenerates
// next-env.d.ts and it carries no code of its own to check.
const NOT_AN_ENTRY_POINT = new Set(['next-env.d.ts']);

function topLevelEntryFiles(appDir: string): string[] {
  return readdirSync(join(repoRoot, appDir))
    .filter((f) => f.endsWith('.ts') && !NOT_AN_ENTRY_POINT.has(f))
    .sort();
}

function includeList(appDir: string): string[] {
  const raw = readFileSync(join(repoRoot, appDir, 'tsconfig.json'), 'utf8');
  return (JSON.parse(raw) as { include?: string[] }).include ?? [];
}

describe.each([['runtime'], ['apps/auth'], ['apps/relay']])(
  '%s tsconfig include covers every top-level entry file',
  (appDir) => {
    it('lists each top-level *.ts file explicitly', () => {
      const entries = topLevelEntryFiles(appDir);
      const include = includeList(appDir);

      // Guard the guard: if this app genuinely has no entry files the
      // assertion below passes vacuously, which would hide a moved directory.
      expect(include.length).toBeGreaterThan(0);

      const missing = entries.filter((f) => !include.includes(f));
      expect(missing, `${appDir}/tsconfig.json is missing: ${missing.join(', ')}`).toEqual([]);
    });
  },
);

describe('the specific files that regressed', () => {
  it('typechecks runtime/instrumentation.ts', () => {
    expect(topLevelEntryFiles('runtime')).toContain('instrumentation.ts');
    expect(includeList('runtime')).toContain('instrumentation.ts');
  });

  it('typechecks apps/auth/middleware.ts', () => {
    expect(topLevelEntryFiles('apps/auth')).toContain('middleware.ts');
    expect(includeList('apps/auth')).toContain('middleware.ts');
  });
});
