/**
 * Enforces the "user-neutral shell" rule that `docs/plugin-development.md`'s
 * `offline` section documents but nothing previously checked: an offline
 * route's own SSR output must carry no per-user data, since a precached copy
 * could be replayed to a different user on a shared device (RFC 0072). This
 * is a static source scan, not a rendered-output diff — it cannot catch
 * every way a server component could leak per-user state, but it catches the
 * common, direct ones (reading the session header, cookies, or a session
 * helper) before a plugin's offline route ever ships.
 *
 * Currently a no-op: no installed plugin declares `offline.routes` yet (see
 * this PR's description). It runs for real the moment one does.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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

/** Scans one server-component source file for identity-reading APIs an
 *  offline route's SSR shell must not call. Exported so its own correctness
 *  is unit-tested directly, independent of any real plugin's file layout. */
export function findForbiddenIdentityAccess(source: string): string[] {
  if (isClientComponent(source)) return [];
  return FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(source)).map((p) => p.label);
}

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collectSourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(entry) ? [full] : [];
  });
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

describe('offline route SSR neutrality (RFC 0072)', () => {
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

  it("every plugin-declared offline route's SSR files are user-neutral", () => {
    const violations: string[] = [];

    for (const manifest of getInstalledPlugins()) {
      const routes = manifest.offline?.routes ?? [];
      if (routes.length === 0) continue;

      const pluginDir = findPluginDir(manifest.id);
      // Registry entry with no matching source directory in this checkout
      // (e.g. a gitignored `.local` community plugin not cloned here) —
      // nothing to scan; that plugin's own repo/CI owns this check.
      if (!pluginDir) continue;

      for (const route of routes) {
        const routeDir = join(PLUGINS_ROOT, pluginDir, 'app', route.prefix);
        for (const file of collectSourceFiles(routeDir)) {
          const hits = findForbiddenIdentityAccess(readFileSync(file, 'utf-8'));
          if (hits.length > 0) violations.push(`${file}: ${hits.join(', ')}`);
        }
      }
    }

    expect(
      violations,
      `Offline-capable route(s) read per-user identity during SSR — a precached ` +
        `copy could be replayed to a different user on a shared device ` +
        `(RFC 0072 "user-neutral shell"):\n${violations.join('\n')}`,
    ).toHaveLength(0);
  });
});
