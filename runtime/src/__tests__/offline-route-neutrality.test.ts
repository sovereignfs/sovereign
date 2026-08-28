/**
 * Enforces the "user-neutral shell" rule that `docs/plugin-development.md`'s
 * `offline` section documents but nothing previously checked: an offline
 * route's own SSR output must carry no per-user data, since a precached copy
 * could be replayed to a different user on a shared device (RFC 0074, RFC
 * 0078). This is a static source scan, not a rendered-output diff — it
 * cannot catch every way a server component could leak per-user state, but
 * it catches the common, direct ones (reading the session header, cookies,
 * or a session helper) before a plugin's offline route ever ships.
 *
 * Scans a plugin's bare `routePrefix` page — the one offline-capable entry
 * point either offline tier (`offline: 'offline-first' | 'device-only'`,
 * research 0012) declares. Formerly a plain boolean (RFC 0078), and before
 * that `offline.root`/`offline.routes[]` (RFC 0074) — this rule has applied
 * to whichever shape the field has taken across all three.
 */
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getInstalledPlugins } from '../registry';

const PLUGINS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'plugins');

const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\bheaders\s*\(/,
    label: 'headers() — reads request-scoped data, including the session header',
  },
  { pattern: /x-sovereign-user-id/i, label: 'x-sovereign-user-id — the per-user identity header' },
  { pattern: /\bcookies\s*\(/, label: 'cookies() — reads the session cookie' },
  { pattern: /getServerSession|getSession\s*\(/, label: 'a session-reading helper' },
];

/** A file whose first statement is the `'use client'` directive hydrates
 *  client-side and never produces the route's SSR output — out of scope. */
function isClientComponent(source: string): boolean {
  return /^\s*(['"])use client\1/.test(source);
}

/** A file whose first statement is the `'use server'` directive is a Server
 *  Actions module: every export is a reference dispatched by a POST, never
 *  code the platform executes while rendering this route's own SSR output —
 *  even though the module is commonly *imported* by a reachable component,
 *  just to obtain the action reference to bind to a form or button. Excluded
 *  regardless of reachability for the same reason a client component is:
 *  present in the import graph, never executed by it. */
function isServerActionModule(source: string): boolean {
  return /^\s*(['"])use server\1/.test(source);
}

/** A test file never ships as part of any real build output, regardless of
 *  whether something in the reachable graph happens to import from one. */
function isTestFile(file: string): boolean {
  return /[\\/]__tests__[\\/]/.test(file) || /\.(test|spec)\.(tsx?|jsx?)$/.test(file);
}

/** Scans one server-component source file for identity-reading APIs an
 *  offline route's SSR shell must not call. Exported so its own correctness
 *  is unit-tested directly, independent of any real plugin's file layout. */
export function findForbiddenIdentityAccess(source: string): string[] {
  if (isClientComponent(source)) return [];
  return FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(source)).map((p) => p.label);
}

/** Next.js file-system route conventions the router wires into a segment's
 *  own render automatically — never via an explicit import statement —  so
 *  they have to seed the reachability walk directly rather than being
 *  discovered as someone else's import. */
const ROUTE_ENTRY_BASENAMES = new Set([
  'page',
  'layout',
  'template',
  'default',
  'loading',
  'error',
  'not-found',
]);

function isRouteEntryFile(filename: string): boolean {
  const match = /^([^.]+)\.(?:tsx|ts|jsx|js)$/.exec(filename);
  return match !== null && ROUTE_ENTRY_BASENAMES.has(match[1] ?? '');
}

const SOURCE_FILE_PATTERN = /\.(tsx?|jsx?)$/;

/** Local relative import specifiers a source file references — `from '...'`
 *  (covers default/named/namespace imports and re-exports) plus a bare
 *  side-effect `import '...'`. A regex scan, matching this file's own
 *  existing style rather than a real parser: over-matching (e.g. a comment
 *  that happens to contain `from './x'`) is harmless, since a specifier that
 *  doesn't resolve to a real file is simply dropped in `resolveRelativeImport`
 *  below. */
function extractRelativeImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/\bfrom\s+(['"])(\.[^'"]*)\1/g)) {
    const specifier = match[2];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  for (const match of source.matchAll(/^\s*import\s+(['"])(\.[^'"]*)\1/gm)) {
    const specifier = match[2];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** Resolves a relative import specifier to a real file on disk, trying
 *  common extensions and `index` files the way Node/bundler resolution
 *  would — the source text never spells out the extension for a `.tsx`/`.ts`
 *  sibling. Returns `undefined` (silently dropped by the caller) rather than
 *  throwing when nothing matches — a package import that happens to start
 *  with `.` incorrectly, or a genuinely stale import, shouldn't crash the scan. */
function resolveRelativeImport(fromFile: string, specifier: string): string | undefined {
  const base = join(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
    join(base, 'index.jsx'),
    join(base, 'index.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function isWithinDirectory(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

/** The subset of a plugin's manifest this module needs — narrowed rather
 *  than importing `SovereignManifest` directly so a unit test can build a
 *  fixture with a plain object literal instead of a fully-valid manifest. */
interface JobsAndSchedulesManifest {
  jobs?: { entry: string }[];
  schedules?: { entry: string }[];
}

/** Absolute paths of every job/schedule handler `entry` the plugin's own
 *  manifest declares — resolved relative to the plugin root (one level above
 *  `appDir`), since `entry` is already a plugin-root-relative path like
 *  `"app/_jobs/due-reminders.ts"`. These modules are invoked directly by the
 *  platform's scheduler/job worker (`runtime/generated/plugin-{jobs,
 *  schedules}.ts`), never rendered as part of any page — excluded outright
 *  regardless of whether something in the reachable graph also imports one
 *  (e.g. for a shared constant or type). */
function collectScheduledEntryPaths(
  appDir: string,
  manifest: JobsAndSchedulesManifest,
): Set<string> {
  const pluginRoot = dirname(appDir);
  const entries = [...(manifest.jobs ?? []), ...(manifest.schedules ?? [])];
  return new Set(entries.map(({ entry }) => join(pluginRoot, entry)));
}

/** For an `offline`-capable plugin's bare `routePrefix` page: every source
 *  file actually reachable from its `page.tsx`/`layout.tsx` (and the other
 *  Next.js route-convention files alongside them) via a chain of local
 *  relative imports — not, as a prior version of this function did, every
 *  top-level file in `app/` plus the unconditional full contents of any
 *  `_`-prefixed directory. That blanket sweep happened to coincide with real
 *  reachability for Launcher (a single-route plugin with one `_components`
 *  helper), but for any plugin with more than one route it swept in
 *  unrelated top-level and co-located files that the bare route's render
 *  never touches — including a real false positive: a shared top-level
 *  `actions.ts` whose one Server Action reads `headers()` for a POST-only
 *  submit, never during this route's own SSR render.
 *
 *  Reachability alone isn't sufficient by itself, either: a Server Actions
 *  module like `actions.ts` is typically still genuinely *imported* by a
 *  reachable component (to obtain the action reference to bind to a form),
 *  so a pure import-graph walk would sweep it right back in. `isExcluded`
 *  below prunes three file categories outright, regardless of reachability,
 *  because none of them ever execute as part of a route's SSR output even
 *  when the import graph does reach them: a `'use server'` module, a
 *  manifest-declared job/schedule handler, and a test file. Pruning means
 *  not just omitting the excluded file itself but never following its own
 *  imports either — anything reachable *only* through an excluded file is,
 *  by the same reasoning, also never SSR-executed. */
export function collectRootSourceFiles(
  appDir: string,
  manifest: JobsAndSchedulesManifest = {},
): string[] {
  if (!existsSync(appDir)) return [];

  const scheduledEntryPaths = collectScheduledEntryPaths(appDir, manifest);
  const isExcluded = (file: string, source: string): boolean =>
    isServerActionModule(source) || isTestFile(file) || scheduledEntryPaths.has(file);

  const entryFiles = readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isRouteEntryFile(entry.name))
    .map((entry) => join(appDir, entry.name));

  const visited = new Set<string>();
  const result: string[] = [];
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    if (!SOURCE_FILE_PATTERN.test(file)) continue;

    const source = readFileSync(file, 'utf-8');
    if (isExcluded(file, source)) continue;

    result.push(file);
    for (const specifier of extractRelativeImportSpecifiers(source)) {
      const resolved = resolveRelativeImport(file, specifier);
      if (resolved && isWithinDirectory(appDir, resolved) && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return result;
}

/** `manifest.id` doesn't necessarily match its `plugins/<dir>` folder name —
 *  resolve by reading each candidate `manifest.json` rather than assuming. */
function findPluginDir(pluginId: string): string | undefined {
  if (!existsSync(PLUGINS_ROOT)) return undefined;
  return readdirSync(PLUGINS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .find((dir) => {
      const manifestPath = join(PLUGINS_ROOT, dir, 'manifest.json');
      if (!existsSync(manifestPath)) return false;
      try {
        return (JSON.parse(readFileSync(manifestPath, 'utf-8')) as { id?: string }).id === pluginId;
      } catch {
        return false;
      }
    });
}

describe('offline route SSR neutrality (RFC 0074)', () => {
  it('flags a server component that reads per-user identity', () => {
    const violation = `
      import { headers } from 'next/headers';
      export default async function Page() {
        const h = await headers();
        return <div>{h.get('x-sovereign-user-id')}</div>;
      }
    `;
    expect(findForbiddenIdentityAccess(violation)).not.toHaveLength(0);
  });

  it('allows a user-neutral server component', () => {
    const clean = `
      export default function Page() {
        return <div>Loading…</div>;
      }
    `;
    expect(findForbiddenIdentityAccess(clean)).toHaveLength(0);
  });

  it('skips client components — they hydrate, they do not produce SSR output', () => {
    const clientCode = `
      'use client';
      import { headers } from 'next/headers';
      export default function Page() { return null; }
    `;
    expect(findForbiddenIdentityAccess(clientCode)).toHaveLength(0);
  });

  describe('collectRootSourceFiles', () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'offline-route-neutrality-'));
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    function writeSource(relativePath: string, content: string): void {
      const full = join(root, relativePath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }

    it('follows local imports transitively through a co-located helper', () => {
      writeSource(
        'app/page.tsx',
        `import { View } from './_components/View';\n` +
          `export default function Page() { return <View />; }\n`,
      );
      writeSource(
        'app/_components/View.tsx',
        `import { getGreeting } from '../_lib/greeting';\n` +
          `export function View() { return <div>{getGreeting()}</div>; }\n`,
      );
      writeSource(
        'app/_lib/greeting.ts',
        `import { headers } from 'next/headers';\n` +
          `export function getGreeting() { return headers().get('x-greeting'); }\n`,
      );

      const appDir = join(root, 'app');
      const files = collectRootSourceFiles(appDir);

      expect(files).toContain(join(appDir, '_lib', 'greeting.ts'));
      const violations = files.flatMap((file) =>
        findForbiddenIdentityAccess(readFileSync(file, 'utf-8')),
      );
      expect(violations.length).toBeGreaterThan(0);
    });

    it('excludes a reachable "use server" actions module, even though a component imports it for its action reference', () => {
      writeSource(
        'app/page.tsx',
        `import { Shell } from './_components/Shell';\n` +
          `export default function Page() { return <Shell />; }\n`,
      );
      writeSource(
        'app/_components/Shell.tsx',
        `'use client';\n` +
          `import { resumeImport } from '../actions';\n` +
          `import { formatLabel } from '../_lib/clean';\n` +
          `export function Shell() { return <button onClick={() => resumeImport()}>{formatLabel()}</button>; }\n`,
      );
      writeSource(
        'app/actions.ts',
        `'use server';\n` +
          `import { headers } from 'next/headers';\n` +
          `export async function resumeImport() {\n` +
          `  const h = await headers();\n` +
          `  return h.get('x-sovereign-user-id');\n` +
          `}\n`,
      );
      writeSource('app/_lib/clean.ts', `export function formatLabel() { return 'Resume'; }\n`);

      const appDir = join(root, 'app');
      const files = collectRootSourceFiles(appDir);

      expect(files).not.toContain(join(appDir, 'actions.ts'));
      expect(files).toContain(join(appDir, '_components', 'Shell.tsx'));
      expect(files).toContain(join(appDir, '_lib', 'clean.ts'));

      const violations = files.flatMap((file) =>
        findForbiddenIdentityAccess(readFileSync(file, 'utf-8')),
      );
      expect(violations).toHaveLength(0);
    });

    it('excludes a manifest-declared job/schedule handler regardless of reachability', () => {
      writeSource(
        'app/page.tsx',
        `import { REMINDER_LABEL } from './_jobs/reminder';\n` +
          `export default function Page() { return <div>{REMINDER_LABEL}</div>; }\n`,
      );
      writeSource(
        'app/_jobs/reminder.ts',
        `import { headers } from 'next/headers';\n` +
          `export const REMINDER_LABEL = 'Reminder';\n` +
          `export default async function handler() {\n` +
          `  return (await headers()).get('x-sovereign-user-id');\n` +
          `}\n`,
      );

      const appDir = join(root, 'app');
      const manifest = { schedules: [{ entry: 'app/_jobs/reminder.ts' }] };

      // Without manifest info the handler is a perfectly ordinary reachable
      // import — confirms the next assertion is the manifest exclusion doing
      // the work, not reachability alone happening to already exclude it.
      expect(collectRootSourceFiles(appDir)).toContain(join(appDir, '_jobs', 'reminder.ts'));

      const files = collectRootSourceFiles(appDir, manifest);
      expect(files).not.toContain(join(appDir, '_jobs', 'reminder.ts'));
    });

    it('excludes a test file, even when something imports it', () => {
      writeSource(
        'app/page.tsx',
        `import { HELPER_LABEL } from './_lib/__tests__/helper.test';\n` +
          `export default function Page() { return <div>{HELPER_LABEL}</div>; }\n`,
      );
      writeSource(
        'app/_lib/__tests__/helper.test.ts',
        `import { headers } from 'next/headers';\n` +
          `export const HELPER_LABEL = 'ok';\n` +
          `it('reads headers', () => { headers(); });\n`,
      );

      const appDir = join(root, 'app');
      const files = collectRootSourceFiles(appDir);

      expect(files).not.toContain(join(appDir, '_lib', '__tests__', 'helper.test.ts'));
    });
  });

  it("every offline-enabled plugin's root SSR files are user-neutral", () => {
    const violations: string[] = [];

    for (const manifest of getInstalledPlugins()) {
      if (manifest.offline === undefined) continue;

      const pluginDir = findPluginDir(manifest.id);
      // Registry entry with no matching source directory in this checkout
      // (e.g. a gitignored `.local` community plugin not cloned here) —
      // nothing to scan; that plugin's own repo/CI owns this check.
      if (!pluginDir) continue;

      const appDir = join(PLUGINS_ROOT, pluginDir, 'app');
      for (const file of collectRootSourceFiles(appDir, manifest)) {
        const hits = findForbiddenIdentityAccess(readFileSync(file, 'utf-8'));
        if (hits.length > 0) violations.push(`${file}: ${hits.join(', ')}`);
      }
    }

    expect(
      violations,
      `Offline-capable plugin(s) read per-user identity during SSR — a precached ` +
        `copy could be replayed to a different user on a shared device ` +
        `(RFC 0074/0078 "user-neutral shell"):\n${violations.join('\n')}`,
    ).toHaveLength(0);
  });
});
