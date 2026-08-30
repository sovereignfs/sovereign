import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SovereignManifest } from '@sovereignfs/manifest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertNoOrphanedRouteDirectories,
  collectPluginEnv,
  collectPluginJobs,
  collectPluginEvents,
  collectPluginSchedules,
  duplicateApiProviders,
  duplicatePluginIds,
  duplicateRoutePrefixes,
  examplesEnabledForBuild,
  linkOrCopyTarget,
  pruneGeneratedEntries,
  pruneStalePluginIcons,
  renderPluginCapabilities,
  renderPluginEnv,
  renderPluginJobs,
  renderPluginEvents,
  renderPluginSchedules,
  renderRegistry,
  resolveComposeTargets,
  sortPluginEntries,
  type EnvDecl,
  type PluginEntry,
} from '../generate-registry';

function manifest(overrides: Partial<SovereignManifest> = {}): SovereignManifest {
  return {
    schemaVersion: 1,
    id: 'com.example.plugin',
    name: 'Example Plugin',
    version: '1.0.0',
    type: 'community',
    runtime: 'native',
    routePrefix: '/example',
    permissions: [],
    compatibility: { minPlatformVersion: '0.0.0' },
    ...overrides,
  };
}

function entry(
  dir: string,
  overrides: Partial<SovereignManifest> = {},
  baseDir?: string,
): PluginEntry {
  return { dir, manifest: manifest(overrides), ...(baseDir ? { baseDir } : {}) };
}

describe('resolveComposeTargets', () => {
  const dirs = {
    platformPluginsDir: '/tmp/runtime/app/(platform)/(plugins)',
    modalDir: '/tmp/runtime/app/(platform)/(plugins)/@modal',
    minimalDir: '/tmp/runtime/app/(minimal)',
  };

  it('rejects multi-segment route prefixes for overlay plugins', () => {
    const result = resolveComposeTargets(
      manifest({ id: 'com.example.overlay', shell: 'overlay', routePrefix: '/admin/reports' }),
      dirs,
    );

    expect(result.ok).toBe(false);
    expect(result.targets).toEqual([]);
    expect(result.error).toContain('multi-segment');
    expect(result.error).toContain('/admin/reports');
  });

  it('accepts multi-segment route prefixes for minimal plugins', () => {
    const result = resolveComposeTargets(
      manifest({ id: 'com.example.minimal', shell: 'minimal', routePrefix: '/kiosk/display' }),
      dirs,
    );

    expect(result.ok).toBe(true);
    expect(result.targets).toEqual(['/tmp/runtime/app/(minimal)/kiosk/display']);
  });
});

describe('plugin generation guards', () => {
  it('detects duplicate apiProvider manifests before route generation', () => {
    const duplicates = duplicateApiProviders([
      entry('a', { id: 'com.example.api-a', apiProvider: true }),
      entry('b', { id: 'com.example.api-b', apiProvider: true }),
      entry('c', { id: 'com.example.regular' }),
    ]);

    expect(duplicates.map((plugin) => plugin.id)).toEqual([
      'com.example.api-a',
      'com.example.api-b',
    ]);
  });

  it('sorts plugin manifests deterministically by manifest id', () => {
    const sorted = sortPluginEntries([
      entry('z-dir', { id: 'com.example.zeta' }),
      entry('a-dir', { id: 'com.example.alpha' }),
      entry('m-dir', { id: 'com.example.middle' }),
    ]);

    expect(sorted.map((plugin) => plugin.manifest.id)).toEqual([
      'com.example.alpha',
      'com.example.middle',
      'com.example.zeta',
    ]);
    expect(sorted.map((plugin) => plugin.dir)).toEqual(['a-dir', 'm-dir', 'z-dir']);
  });

  // Guards against a real clone (plugins/<id>) coexisting with a personal
  // plugins/<id>.local dev override — both declare the same manifest id,
  // which install-plugins.ts's isPluginInstalled() now prevents at the
  // source, but this is a second line of defense so any other cause (e.g. two
  // differently-named directories both declaring the same id by mistake)
  // fails loudly at generate time instead of producing a duplicate registry
  // entry (a broken React key in the nav rail at runtime).
  it('detects two directories declaring the same manifest id', () => {
    const duplicates = duplicatePluginIds([
      entry('sovereign-tasks', { id: 'fs.sovereign.tasks' }),
      entry('sovereign-tasks.local', { id: 'fs.sovereign.tasks' }),
      entry('console', { id: 'fs.sovereign.console' }),
    ]);

    expect(Object.fromEntries(duplicates)).toEqual({
      'fs.sovereign.tasks': ['sovereign-tasks', 'sovereign-tasks.local'],
    });
  });

  it('reports no duplicates when every manifest id is unique', () => {
    const duplicates = duplicatePluginIds([
      entry('a', { id: 'com.example.a' }),
      entry('b', { id: 'com.example.b' }),
    ]);

    expect(duplicates.size).toBe(0);
  });

  // A manually-copied example (e.g. plugins/example-basic) coexisting with
  // the real source under example-plugins/example-basic — same manifest id,
  // different baseDir. The duplicate-id check is keyed on manifest id only,
  // so this must fail loudly exactly like the plugins/<id>.local case.
  it('detects a duplicate id across plugins/ and example-plugins/', () => {
    const duplicates = duplicatePluginIds([
      entry('example-basic', { id: 'fs.sovereign.example-basic' }),
      entry('example-basic', { id: 'fs.sovereign.example-basic' }, '/repo/example-plugins'),
    ]);

    expect(Object.fromEntries(duplicates)).toEqual({
      'fs.sovereign.example-basic': ['example-basic', 'example-basic'],
    });
  });

  // Two different plugin ids resolving to the same composed destination --
  // silent last-write-wins in production, a corrupted interleaved route
  // tree in dev (see duplicateRoutePrefixes's own doc comment).
  describe('duplicateRoutePrefixes', () => {
    it('detects two default-shell plugins declaring the identical routePrefix', () => {
      const duplicates = duplicateRoutePrefixes([
        entry('a', { id: 'com.example.a', routePrefix: '/dashboard' }),
        entry('b', { id: 'com.example.b', routePrefix: '/dashboard' }),
      ]);

      expect(duplicates.size).toBe(1);
      const [ids] = [...duplicates.values()];
      expect(ids).toEqual(['com.example.a', 'com.example.b']);
    });

    it('detects a default-shell and an overlay-shell plugin colliding on the shared fallback target', () => {
      const duplicates = duplicateRoutePrefixes([
        entry('a', { id: 'com.example.a', routePrefix: '/console' }),
        entry('b', { id: 'com.example.b', shell: 'overlay', routePrefix: '/console' }),
      ]);

      expect(duplicates.size).toBeGreaterThan(0);
      const collidingIds = [...duplicates.values()].flat();
      expect(collidingIds).toContain('com.example.a');
      expect(collidingIds).toContain('com.example.b');
    });

    it('does not flag two plugins sharing a route segment but landing under different shell destinations', () => {
      const duplicates = duplicateRoutePrefixes([
        entry('a', { id: 'com.example.a', shell: 'minimal', routePrefix: '/kiosk' }),
        entry('b', { id: 'com.example.b', shell: 'default', routePrefix: '/kiosk' }),
      ]);

      expect(duplicates.size).toBe(0);
    });

    it('does not flag two overlay plugins with different routePrefix values, even though each writes two targets', () => {
      const duplicates = duplicateRoutePrefixes([
        entry('a', { id: 'com.example.a', shell: 'overlay', routePrefix: '/console' }),
        entry('b', { id: 'com.example.b', shell: 'overlay', routePrefix: '/wallet' }),
      ]);

      expect(duplicates.size).toBe(0);
    });

    it('reports no duplicates for a set of entirely unique routePrefix values', () => {
      const duplicates = duplicateRoutePrefixes([
        entry('a', { id: 'com.example.a', routePrefix: '/a' }),
        entry('b', { id: 'com.example.b', routePrefix: '/b' }),
      ]);

      expect(duplicates.size).toBe(0);
    });

    it('skips a manifest that already failed its own resolveComposeTargets check (e.g. overlay + multi-segment)', () => {
      const duplicates = duplicateRoutePrefixes([
        entry('a', { id: 'com.example.a', shell: 'overlay', routePrefix: '/admin/reports' }),
        entry('b', { id: 'com.example.b', routePrefix: '/other' }),
      ]);

      expect(duplicates.size).toBe(0);
    });
  });
});

describe('examplesEnabledForBuild', () => {
  const ORIGINAL = process.env.SOVEREIGN_EXAMPLES_ENABLED;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SOVEREIGN_EXAMPLES_ENABLED;
    else process.env.SOVEREIGN_EXAMPLES_ENABLED = ORIGINAL;
  });

  it('is off by default (unset)', () => {
    delete process.env.SOVEREIGN_EXAMPLES_ENABLED;
    expect(examplesEnabledForBuild()).toBe(false);
  });

  it.each(['1', 'true', 'yes', 'on', 'TRUE', ' on '])('treats %j as enabled', (value) => {
    process.env.SOVEREIGN_EXAMPLES_ENABLED = value;
    expect(examplesEnabledForBuild()).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off', ''])('treats %j as disabled', (value) => {
    process.env.SOVEREIGN_EXAMPLES_ENABLED = value;
    expect(examplesEnabledForBuild()).toBe(false);
  });
});

describe('generated TypeScript artifacts', () => {
  it('renders the registry from sorted manifest order', () => {
    const sorted = sortPluginEntries([
      entry('z-dir', { id: 'com.example.zeta' }),
      entry('a-dir', { id: 'com.example.alpha' }),
    ]);

    const content = renderRegistry(sorted);

    expect(content).toContain('AUTO-GENERATED by scripts/generate-registry.ts');
    expect(content.indexOf('"id": "com.example.alpha"')).toBeLessThan(
      content.indexOf('"id": "com.example.zeta"'),
    );
  });

  it('renders plugin capabilities and all-granted capabilities deterministically', () => {
    const content = renderPluginCapabilities([
      entry('notes', {
        id: 'com.example.notes',
        capabilities: {
          'read-notes': { description: 'Read notes', defaultGrant: 'all' },
          'write-notes': { description: 'Write notes' },
        },
      }),
    ]);

    expect(content).toContain('"namespacedCap": "com.example.notes:read-notes"');
    expect(content).toContain('"namespacedCap": "com.example.notes:write-notes"');
    expect(content).toContain('"defaultGrant": "none"');
    expect(content).toContain(
      'export const ALL_GRANTED_PLUGIN_CAPS: string[] = [\n  "com.example.notes:read-notes"\n];',
    );
  });
});

describe('plugin env generation', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'generate-registry-env-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does not embed secret env default values in generated output', () => {
    const content = renderPluginEnv([
      {
        pluginId: 'com.example.secret',
        key: 'TOKEN',
        namespacedKey: 'SV_PLUGIN_COM_EXAMPLE_SECRET_TOKEN',
        required: true,
        secret: true,
        scope: 'runtime',
        defaultValue: 'do-not-embed',
      },
    ]);

    expect(content).toContain('"secret": true');
    expect(content).toContain('"SV_PLUGIN_COM_EXAMPLE_SECRET_TOKEN"');
    expect(content).not.toContain('do-not-embed');
  });

  it('uses plugin .env values only as non-secret dev defaults', () => {
    mkdirSync(join(root, 'notes'));
    writeFileSync(join(root, 'notes', '.env'), 'PUBLIC_LABEL=Local label\nTOKEN=plain-secret\n');

    const allowed = collectPluginEnv(
      [
        entry('notes', {
          id: 'com.example.notes',
          env: {
            PUBLIC_LABEL: {
              description: 'Development label',
              scope: 'runtime',
            },
          },
        }),
      ],
      root,
    );

    expect(allowed.ok).toBe(true);
    expect(allowed.decls).toMatchObject([
      {
        pluginId: 'com.example.notes',
        key: 'PUBLIC_LABEL',
        defaultValue: 'Local label',
        secret: false,
      } satisfies Partial<EnvDecl>,
    ]);

    const rejected = collectPluginEnv(
      [
        entry('notes', {
          id: 'com.example.notes',
          env: {
            TOKEN: {
              description: 'Secret token',
              required: true,
              secret: true,
              scope: 'runtime',
            },
          },
        }),
      ],
      root,
    );

    expect(rejected.ok).toBe(false);
    expect(rejected.error).toContain('marked secret');
    expect(rejected.error).toContain('plugins/notes/.env');
  });

  it("reads a plugin's .env from its own baseDir, not the shared pluginsDir fallback", () => {
    const examplesRoot = mkdtempSync(join(tmpdir(), 'generate-registry-examples-'));
    try {
      mkdirSync(join(examplesRoot, 'example-basic'));
      writeFileSync(
        join(examplesRoot, 'example-basic', '.env'),
        'PUBLIC_LABEL=From example-plugins\n',
      );

      const result = collectPluginEnv(
        [
          entry(
            'example-basic',
            {
              id: 'fs.sovereign.example-basic',
              env: { PUBLIC_LABEL: { description: 'Label', scope: 'runtime' } },
            },
            examplesRoot,
          ),
        ],
        root, // pluginsDir fallback — must NOT be where this entry's .env is read from
      );

      expect(result.ok).toBe(true);
      expect(result.decls).toMatchObject([
        { pluginId: 'fs.sovereign.example-basic', defaultValue: 'From example-plugins' },
      ]);
    } finally {
      rmSync(examplesRoot, { recursive: true, force: true });
    }
  });
});

describe('linkOrCopyTarget — dev copies, production symlinks', () => {
  let root: string;
  let src: string;
  let dest: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'generate-registry-compose-'));
    src = join(root, 'plugin-app');
    dest = join(root, 'composed');
    mkdirSync(src);
    writeFileSync(join(src, 'page.tsx'), 'export default function Page() {}');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('dev: copies files into a real directory, not a symlink', () => {
    linkOrCopyTarget(src, dest, false);

    expect(lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(existsSync(join(dest, 'page.tsx'))).toBe(true);
    expect(readFileSync(join(dest, 'page.tsx'), 'utf8')).toContain('export default');
  });

  it('dev: re-running only touches files that actually changed', () => {
    linkOrCopyTarget(src, dest, false);
    const firstCopyMtime = lstatSync(join(dest, 'page.tsx')).mtimeMs;

    // Re-run with no source change — the unchanged file must not be rewritten
    // (rewriting would spuriously invalidate Next's dev route watcher).
    linkOrCopyTarget(src, dest, false);
    expect(lstatSync(join(dest, 'page.tsx')).mtimeMs).toBe(firstCopyMtime);
  });

  it('production: creates a real symlink to the plugin source, not a copy', () => {
    linkOrCopyTarget(src, dest, true);

    expect(lstatSync(dest).isSymbolicLink()).toBe(true);
    // Resolves back to the plugin's own app/ — this is exactly what lets a
    // composed plugin's imports find its own node_modules at build time.
    expect(existsSync(join(dest, 'page.tsx'))).toBe(true);
    expect(readFileSync(join(dest, 'page.tsx'), 'utf8')).toContain('export default');
  });

  it('production: replaces a stale copy left over from a previous dev run', () => {
    linkOrCopyTarget(src, dest, false); // dev leaves a real directory
    expect(lstatSync(dest).isSymbolicLink()).toBe(false);

    linkOrCopyTarget(src, dest, true); // production must replace it with a symlink
    expect(lstatSync(dest).isSymbolicLink()).toBe(true);
  });

  it('dev: replaces a stale symlink left over from a previous production run', () => {
    linkOrCopyTarget(src, dest, true); // production leaves a symlink
    expect(lstatSync(dest).isSymbolicLink()).toBe(true);

    linkOrCopyTarget(src, dest, false); // dev must replace it with a real directory
    expect(lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(existsSync(join(dest, 'page.tsx'))).toBe(true);
  });
});

describe('generated artifact pruning', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'generate-registry-prune-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('prunes stale generated routes while preserving active and committed entries', () => {
    mkdirSync(join(root, 'active'));
    mkdirSync(join(root, 'stale'));
    writeFileSync(join(root, 'layout.tsx'), 'layout');

    pruneGeneratedEntries(root, new Set(['active']), { keep: new Set(['layout.tsx']) });

    expect(existsSync(join(root, 'active'))).toBe(true);
    expect(existsSync(join(root, 'layout.tsx'))).toBe(true);
    expect(existsSync(join(root, 'stale'))).toBe(false);
  });

  it('prunes only stale generated modal routes', () => {
    mkdirSync(join(root, '(.)active'));
    mkdirSync(join(root, '(.)stale'));
    writeFileSync(join(root, 'default.tsx'), 'default');

    pruneGeneratedEntries(root, new Set(['(.)active']), { onlyPrefix: '(.)' });

    expect(existsSync(join(root, '(.)active'))).toBe(true);
    expect(existsSync(join(root, 'default.tsx'))).toBe(true);
    expect(existsSync(join(root, '(.)stale'))).toBe(false);
  });

  // A multi-segment routePrefix (shell: minimal) plugin renamed from
  // /kiosk/display to /kiosk/settings: the old first-segment-only tracking
  // left the stale nested leaf on disk forever, since "kiosk" still matched
  // an active entry. Full relative-path tracking must actually remove it.
  it('recursively prunes a stale nested leaf when a multi-segment routePrefix plugin is renamed', () => {
    mkdirSync(join(root, 'kiosk', 'display', 'inner'), { recursive: true });
    writeFileSync(join(root, 'kiosk', 'display', 'page.tsx'), 'page');
    writeFileSync(join(root, 'kiosk', 'display', 'inner', 'thing.ts'), 'x');
    mkdirSync(join(root, 'kiosk', 'settings'), { recursive: true });
    writeFileSync(join(root, 'kiosk', 'settings', 'page.tsx'), 'page');

    pruneGeneratedEntries(root, new Set(['kiosk/settings']));

    expect(existsSync(join(root, 'kiosk', 'display'))).toBe(false);
    expect(existsSync(join(root, 'kiosk', 'settings'))).toBe(true);
    expect(existsSync(join(root, 'kiosk'))).toBe(true);
  });

  it('removes the shared parent segment once every nested leaf under it is gone', () => {
    mkdirSync(join(root, 'kiosk', 'display'), { recursive: true });
    writeFileSync(join(root, 'kiosk', 'display', 'page.tsx'), 'page');

    pruneGeneratedEntries(root, new Set());

    expect(existsSync(join(root, 'kiosk'))).toBe(false);
  });

  it('leaves an active multi-segment leaf and its parent untouched alongside a stale sibling', () => {
    mkdirSync(join(root, 'kiosk', 'display'), { recursive: true });
    writeFileSync(join(root, 'kiosk', 'display', 'page.tsx'), 'page');
    mkdirSync(join(root, 'stale-top'), { recursive: true });

    pruneGeneratedEntries(root, new Set(['kiosk/display']));

    expect(existsSync(join(root, 'kiosk', 'display', 'page.tsx'))).toBe(true);
    expect(existsSync(join(root, 'stale-top'))).toBe(false);
  });

  it('prunes stale generated plugin icons', () => {
    writeFileSync(join(root, 'com.example.active.svg'), '<svg />');
    writeFileSync(join(root, 'com.example.stale.svg'), '<svg />');

    pruneStalePluginIcons(root, new Set(['com.example.active']));

    expect(existsSync(join(root, 'com.example.active.svg'))).toBe(true);
    expect(existsSync(join(root, 'com.example.stale.svg'))).toBe(false);
  });

  it('prunes PNG variants for a fully-removed plugin, same as its SVG (RFC 0081)', () => {
    for (const suffix of ['.svg', '-192.png', '-512.png', '-maskable-512.png']) {
      writeFileSync(join(root, `com.example.stale${suffix}`), 'x');
    }
    writeFileSync(join(root, 'com.example.active.svg'), '<svg />');

    pruneStalePluginIcons(root, new Set(['com.example.active']));

    for (const suffix of ['.svg', '-192.png', '-512.png', '-maskable-512.png']) {
      expect(existsSync(join(root, `com.example.stale${suffix}`))).toBe(false);
    }
  });

  it('does not mistake "-maskable-512.png" for "-512.png" when deriving the plugin id', () => {
    writeFileSync(join(root, 'com.example.active-maskable-512.png'), 'x');

    pruneStalePluginIcons(root, new Set(['com.example.active']));

    // A wrong id-extraction (stripping only "-512.png") would derive
    // "com.example.active-maskable" — not in the active set — and delete
    // this file incorrectly.
    expect(existsSync(join(root, 'com.example.active-maskable-512.png'))).toBe(true);
  });

  it('prunes only the PNGs — not the SVG — for a plugin still active but no longer installable', () => {
    writeFileSync(join(root, 'com.example.active.svg'), '<svg />');
    writeFileSync(join(root, 'com.example.active-192.png'), 'x');
    writeFileSync(join(root, 'com.example.active-512.png'), 'x');
    writeFileSync(join(root, 'com.example.active-maskable-512.png'), 'x');

    pruneStalePluginIcons(
      root,
      new Set(['com.example.active']),
      new Set(), // no longer installable, but still installed
    );

    expect(existsSync(join(root, 'com.example.active.svg'))).toBe(true);
    expect(existsSync(join(root, 'com.example.active-192.png'))).toBe(false);
    expect(existsSync(join(root, 'com.example.active-512.png'))).toBe(false);
    expect(existsSync(join(root, 'com.example.active-maskable-512.png'))).toBe(false);
  });

  it('defaults installablePluginIds to activePluginIds, keeping every active PNG (backward compatible)', () => {
    writeFileSync(join(root, 'com.example.active.svg'), '<svg />');
    writeFileSync(join(root, 'com.example.active-192.png'), 'x');

    pruneStalePluginIcons(root, new Set(['com.example.active'])); // no third arg

    expect(existsSync(join(root, 'com.example.active-192.png'))).toBe(true);
  });

  // Defense-in-depth: independent of whether pruneGeneratedEntries itself is
  // correct, this must catch a composed leaf left on disk with no matching
  // active registry entry and fail loudly rather than silently letting it
  // keep serving with none of the runtime's access-control gating.
  describe('assertNoOrphanedRouteDirectories', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('does nothing when every composed leaf has a matching active entry', () => {
      mkdirSync(join(root, 'active'), { recursive: true });
      writeFileSync(join(root, 'active', 'page.tsx'), 'page');

      assertNoOrphanedRouteDirectories([{ dir: root, activeEntries: new Set(['active']) }]);

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('detects and fails loudly on an orphaned leaf with no active entry', () => {
      mkdirSync(join(root, 'orphan'), { recursive: true });
      writeFileSync(join(root, 'orphan', 'page.tsx'), 'page');

      assertNoOrphanedRouteDirectories([{ dir: root, activeEntries: new Set() }]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      const messages: string[] = errorSpy.mock.calls.map((call: unknown[]) => call.join(' '));
      expect(messages.some((m) => m.includes('orphan'))).toBe(true);
    });

    it('detects an orphaned nested leaf even when its parent segment is not itself a route', () => {
      mkdirSync(join(root, 'kiosk', 'orphan'), { recursive: true });
      writeFileSync(join(root, 'kiosk', 'orphan', 'page.tsx'), 'page');

      assertNoOrphanedRouteDirectories([{ dir: root, activeEntries: new Set(['kiosk/other']) }]);

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not descend into an active leaf, even if it contains nested directories', () => {
      mkdirSync(join(root, 'active', 'inner'), { recursive: true });
      writeFileSync(join(root, 'active', 'page.tsx'), 'page');
      writeFileSync(
        join(root, 'active', 'inner', 'page.tsx'),
        "nested page, part of the plugin's own tree",
      );

      assertNoOrphanedRouteDirectories([{ dir: root, activeEntries: new Set(['active']) }]);

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('respects onlyPrefix filtering at the root, matching pruneGeneratedEntries (a hand-written non-(.)  route dir is never flagged)', () => {
      mkdirSync(join(root, '(.)active'), { recursive: true });
      writeFileSync(join(root, '(.)active', 'page.tsx'), 'page');
      // Hand-written modal chrome, not `(.)`-prefixed and not in any active
      // set -- must be ignored by the onlyPrefix filter, not flagged as an
      // orphan, the same way pruneGeneratedEntries's own onlyPrefix does.
      mkdirSync(join(root, 'hand-written-dir'), { recursive: true });
      writeFileSync(join(root, 'hand-written-dir', 'page.tsx'), 'page');

      assertNoOrphanedRouteDirectories([
        { dir: root, activeEntries: new Set(['(.)active']), onlyPrefix: '(.)' },
      ]);

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('respects keep filtering at the root, matching pruneGeneratedEntries', () => {
      mkdirSync(join(root, 'active'), { recursive: true });
      writeFileSync(join(root, 'active', 'page.tsx'), 'page');
      // A kept directory (e.g. @modal) has its own separate consistency
      // check elsewhere -- it must never be flagged here even though it's
      // not in this base's own active set.
      mkdirSync(join(root, '@modal'), { recursive: true });
      writeFileSync(join(root, '@modal', 'page.tsx'), 'page');

      assertNoOrphanedRouteDirectories([
        { dir: root, activeEntries: new Set(['active']), keep: new Set(['@modal']) },
      ]);

      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});

describe('plugin schedules generation', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'generate-registry-schedules-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function scheduleEntry(dir: string, overrides: Partial<SovereignManifest> = {}): PluginEntry {
    // A real entry file so collectPluginSchedules's existence check passes.
    mkdirSync(join(root, dir, 'app', '_jobs'), { recursive: true });
    writeFileSync(join(root, dir, 'app', '_jobs', 'sync.ts'), 'export default async () => {};');
    return entry(dir, {
      schedules: [{ id: 'sync', intervalMinutes: 5, entry: 'app/_jobs/sync.ts' }],
      ...overrides,
    });
  }

  it("resolves a schedule to the plugin's own real source import path", () => {
    const generatedDir = join(root, 'runtime', 'generated');
    const result = collectPluginSchedules([scheduleEntry('example')], {
      pluginsDir: root,
      generatedDir,
    });

    expect(result.error).toBeUndefined();
    expect(result.decls).toHaveLength(1);
    const decl = result.decls[0];
    expect(decl?.pluginId).toBe('com.example.plugin');
    expect(decl?.scheduleId).toBe('sync');
    expect(decl?.intervalMinutes).toBe(5);
    // Relative from runtime/generated to the plugin's real source file
    // (never its composed route-tree copy/symlink — see the importPath
    // comment in plugin-schedules.ts for why), extension stripped so it is
    // a valid import specifier.
    expect(decl?.importPath).toBe('../../example/app/_jobs/sync');
    expect(decl?.importPath.endsWith('.ts')).toBe(false);
  });

  it('errors when a declared entry module does not exist', () => {
    const result = collectPluginSchedules(
      [
        entry('example', {
          schedules: [{ id: 'sync', intervalMinutes: 5, entry: 'app/_jobs/missing.ts' }],
        }),
      ],
      { pluginsDir: root, generatedDir: join(root, 'runtime', 'generated') },
    );

    expect(result.error).toContain('missing.ts');
    expect(result.decls).toHaveLength(0);
  });

  it('skips plugins without schedules', () => {
    const result = collectPluginSchedules([entry('plain')], {
      pluginsDir: root,
      generatedDir: join(root, 'runtime', 'generated'),
    });
    expect(result.error).toBeUndefined();
    expect(result.decls).toHaveLength(0);
  });

  it('resolves a schedule entry from its own baseDir, not the shared pluginsDir fallback', () => {
    const examplesRoot = mkdtempSync(join(tmpdir(), 'generate-registry-schedules-examples-'));
    try {
      mkdirSync(join(examplesRoot, 'example-basic', 'app', '_jobs'), { recursive: true });
      writeFileSync(
        join(examplesRoot, 'example-basic', 'app', '_jobs', 'sync.ts'),
        'export default async () => {};',
      );
      const exampleEntry = entry(
        'example-basic',
        {
          id: 'fs.sovereign.example-basic',
          schedules: [{ id: 'sync', intervalMinutes: 5, entry: 'app/_jobs/sync.ts' }],
        },
        examplesRoot,
      );

      const result = collectPluginSchedules([exampleEntry], {
        pluginsDir: root, // must NOT be where this entry's schedule file is read from
        generatedDir: join(root, 'runtime', 'generated'),
      });

      expect(result.error).toBeUndefined();
      expect(result.decls).toHaveLength(1);
      expect(result.decls[0]?.pluginId).toBe('fs.sovereign.example-basic');
    } finally {
      rmSync(examplesRoot, { recursive: true, force: true });
    }
  });

  it('renders an importing module for declared schedules', () => {
    const content = renderPluginSchedules([
      {
        pluginId: 'com.example.plugin',
        scheduleId: 'sync',
        intervalMinutes: 5,
        importPath: '../../plugins/example/app/_jobs/sync',
      },
    ]);

    expect(content).toContain('AUTO-GENERATED by scripts/generate-registry.ts');
    expect(content).toContain('import handler0 from "../../plugins/example/app/_jobs/sync";');
    expect(content).toContain('pluginId: "com.example.plugin"');
    expect(content).toContain('scheduleId: "sync"');
    expect(content).toContain('intervalMinutes: 5');
    expect(content).toContain('handler: handler0');
  });

  it('renders an import-free module when no plugin declares schedules', () => {
    const content = renderPluginSchedules([]);
    expect(content).not.toContain('import ');
    expect(content).toContain('export const PLUGIN_SCHEDULES: PluginScheduleDecl[] = [];');
  });
});

describe('plugin jobs generation', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'generate-registry-jobs-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function jobEntry(dir: string, overrides: Partial<SovereignManifest> = {}): PluginEntry {
    // A real entry file so collectPluginJobs's existence check passes.
    mkdirSync(join(root, dir, 'app', '_jobs'), { recursive: true });
    writeFileSync(
      join(root, dir, 'app', '_jobs', 'sync-remote.ts'),
      'export default async () => {};',
    );
    return entry(dir, {
      jobs: [{ type: 'sync.remote', entry: 'app/_jobs/sync-remote.ts', maxAttempts: 5 }],
      ...overrides,
    });
  }

  it("resolves a job to the plugin's own real source import path", () => {
    const generatedDir = join(root, 'runtime', 'generated');
    const result = collectPluginJobs([jobEntry('example')], {
      pluginsDir: root,
      generatedDir,
    });

    expect(result.error).toBeUndefined();
    expect(result.decls).toHaveLength(1);
    const decl = result.decls[0];
    expect(decl?.pluginId).toBe('com.example.plugin');
    expect(decl?.type).toBe('sync.remote');
    expect(decl?.maxAttempts).toBe(5);
    // Relative from runtime/generated to the plugin's real source file —
    // see plugin-schedules.ts's identical importPath comment for why.
    expect(decl?.importPath).toBe('../../example/app/_jobs/sync-remote');
    expect(decl?.importPath.endsWith('.ts')).toBe(false);
  });

  it('errors when a declared entry module does not exist', () => {
    const result = collectPluginJobs(
      [
        entry('example', {
          jobs: [{ type: 'sync.remote', entry: 'app/_jobs/missing.ts' }],
        }),
      ],
      { pluginsDir: root, generatedDir: join(root, 'runtime', 'generated') },
    );

    expect(result.error).toContain('missing.ts');
    expect(result.decls).toHaveLength(0);
  });

  it('skips plugins without jobs', () => {
    const result = collectPluginJobs([entry('plain')], {
      pluginsDir: root,
      generatedDir: join(root, 'runtime', 'generated'),
    });
    expect(result.error).toBeUndefined();
    expect(result.decls).toHaveLength(0);
  });

  it('resolves a job entry from its own baseDir, not the shared pluginsDir fallback', () => {
    const examplesRoot = mkdtempSync(join(tmpdir(), 'generate-registry-jobs-examples-'));
    try {
      mkdirSync(join(examplesRoot, 'example-basic', 'app', '_jobs'), { recursive: true });
      writeFileSync(
        join(examplesRoot, 'example-basic', 'app', '_jobs', 'sync-remote.ts'),
        'export default async () => {};',
      );
      const exampleEntry = entry(
        'example-basic',
        {
          id: 'fs.sovereign.example-basic',
          jobs: [{ type: 'sync.remote', entry: 'app/_jobs/sync-remote.ts' }],
        },
        examplesRoot,
      );

      const result = collectPluginJobs([exampleEntry], {
        pluginsDir: root, // must NOT be where this entry's job file is read from
        generatedDir: join(root, 'runtime', 'generated'),
      });

      expect(result.error).toBeUndefined();
      expect(result.decls).toHaveLength(1);
      expect(result.decls[0]?.pluginId).toBe('fs.sovereign.example-basic');
    } finally {
      rmSync(examplesRoot, { recursive: true, force: true });
    }
  });

  it('renders an importing module for declared jobs', () => {
    const content = renderPluginJobs([
      {
        pluginId: 'com.example.plugin',
        type: 'sync.remote',
        maxAttempts: 5,
        importPath: '../../plugins/example/app/_jobs/sync-remote',
      },
    ]);

    expect(content).toContain('AUTO-GENERATED by scripts/generate-registry.ts');
    expect(content).toContain(
      'import handler0 from "../../plugins/example/app/_jobs/sync-remote";',
    );
    expect(content).toContain('pluginId: "com.example.plugin"');
    expect(content).toContain('type: "sync.remote"');
    expect(content).toContain('maxAttempts: 5');
    expect(content).toContain('handler: handler0');
  });

  it('renders undefined maxAttempts when not declared', () => {
    const content = renderPluginJobs([
      {
        pluginId: 'com.example.plugin',
        type: 'sync.remote',
        importPath: '../../plugins/example/app/_jobs/sync-remote',
      },
    ]);
    expect(content).toContain('maxAttempts: undefined');
  });

  it('renders an import-free module when no plugin declares jobs', () => {
    const content = renderPluginJobs([]);
    expect(content).not.toContain('import ');
    expect(content).toContain('export const PLUGIN_JOBS: PluginJobDecl[] = [];');
  });
});

describe('plugin events (channel authorizer) generation', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'generate-registry-events-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function eventEntry(dir: string, overrides: Partial<SovereignManifest> = {}): PluginEntry {
    // A real entry file so collectPluginEvents's existence check passes.
    mkdirSync(join(root, dir, 'app', '_events'), { recursive: true });
    writeFileSync(
      join(root, dir, 'app', '_events', 'authorize-list.ts'),
      'export default async () => true;',
    );
    return entry(dir, {
      events: [{ pattern: 'list:*', entry: 'app/_events/authorize-list.ts' }],
      ...overrides,
    });
  }

  it("resolves an event authorizer to the plugin's own real source import path", () => {
    const generatedDir = join(root, 'runtime', 'generated');
    const result = collectPluginEvents([eventEntry('example')], {
      pluginsDir: root,
      generatedDir,
    });

    expect(result.error).toBeUndefined();
    expect(result.decls).toHaveLength(1);
    const decl = result.decls[0];
    expect(decl?.pluginId).toBe('com.example.plugin');
    expect(decl?.pattern).toBe('list:*');
    // Relative from runtime/generated to the plugin's real source file —
    // see plugin-schedules.ts's identical importPath comment for why.
    expect(decl?.importPath).toBe('../../example/app/_events/authorize-list');
    expect(decl?.importPath.endsWith('.ts')).toBe(false);
  });

  it('errors when a declared entry module does not exist', () => {
    const result = collectPluginEvents(
      [
        entry('example', {
          events: [{ pattern: 'list:*', entry: 'app/_events/missing.ts' }],
        }),
      ],
      { pluginsDir: root, generatedDir: join(root, 'runtime', 'generated') },
    );

    expect(result.error).toContain('missing.ts');
    expect(result.decls).toHaveLength(0);
  });

  it('skips plugins without events', () => {
    const result = collectPluginEvents([entry('plain')], {
      pluginsDir: root,
      generatedDir: join(root, 'runtime', 'generated'),
    });
    expect(result.error).toBeUndefined();
    expect(result.decls).toHaveLength(0);
  });

  it('resolves an event entry from its own baseDir, not the shared pluginsDir fallback', () => {
    const examplesRoot = mkdtempSync(join(tmpdir(), 'generate-registry-events-examples-'));
    try {
      mkdirSync(join(examplesRoot, 'example-basic', 'app', '_events'), { recursive: true });
      writeFileSync(
        join(examplesRoot, 'example-basic', 'app', '_events', 'authorize-list.ts'),
        'export default async () => true;',
      );
      const exampleEntry = entry(
        'example-basic',
        {
          id: 'fs.sovereign.example-basic',
          events: [{ pattern: 'list:*', entry: 'app/_events/authorize-list.ts' }],
        },
        examplesRoot,
      );

      const result = collectPluginEvents([exampleEntry], {
        pluginsDir: root, // must NOT be where this entry's event file is read from
        generatedDir: join(root, 'runtime', 'generated'),
      });

      expect(result.error).toBeUndefined();
      expect(result.decls).toHaveLength(1);
      expect(result.decls[0]?.pluginId).toBe('fs.sovereign.example-basic');
    } finally {
      rmSync(examplesRoot, { recursive: true, force: true });
    }
  });

  it('renders an importing module for declared event authorizers', () => {
    const content = renderPluginEvents([
      {
        pluginId: 'com.example.plugin',
        pattern: 'list:*',
        importPath: '../../plugins/example/app/_events/authorize-list',
      },
    ]);

    expect(content).toContain('AUTO-GENERATED by scripts/generate-registry.ts');
    expect(content).toContain(
      'import handler0 from "../../plugins/example/app/_events/authorize-list";',
    );
    expect(content).toContain('pluginId: "com.example.plugin"');
    expect(content).toContain('pattern: "list:*"');
    expect(content).toContain('handler: handler0');
  });

  it('renders an import-free module when no plugin declares events', () => {
    const content = renderPluginEvents([]);
    expect(content).not.toContain('import ');
    expect(content).toContain(
      'export const PLUGIN_EVENT_AUTHORIZERS: PluginEventAuthorizerDecl[] = [];',
    );
  });
});
