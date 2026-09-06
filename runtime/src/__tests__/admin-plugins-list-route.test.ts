import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * `GET /api/admin/plugins` tells Console which rows may offer Remove.
 * `sv plugin remove <dir>` deletes `plugins/<dir>`, and only `sv plugin add`
 * installs compose under their manifest id — so first-party plugins (other
 * directory names) and anything without a source directory (the production
 * image) must report `removable: false`, or Console offers a Remove that
 * always fails with "not installed".
 */

let root = '';

vi.mock('@sovereignfs/db', () => ({ findWorkspaceRoot: () => root }));
vi.mock('../admin-guard', () => ({ checkAdminKey: () => null }));
vi.mock('../db', () => ({ getPlatformDb: () => Promise.resolve({}) }));
vi.mock('../plugin-compat', () => ({
  getIncompatibilityReason: () => null,
  getCompatibilityWarnings: () => [],
}));
vi.mock('../plugin-status', () => ({ getDisabledPluginIds: () => Promise.resolve([]) }));
vi.mock('../registry', () => ({
  getInstalledPlugins: () => [
    { id: 'fs.sovereign.console', name: 'Console', type: 'platform', permissions: [] },
    { id: 'com.example.addon', name: 'Addon', type: 'sovereign', permissions: [] },
    { id: 'fs.sovereign.warden', name: 'Warden', type: 'sovereign', permissions: [] },
  ],
}));

const { GET } = await import('../../app/api/admin/plugins/route');

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'sv-plugins-route-'));
  // Only the sv-plugin-add install has a directory named after its id;
  // Warden lives at plugins/warden and the console at plugins/console.
  mkdirSync(join(root, 'plugins', 'com.example.addon'), { recursive: true });
  mkdirSync(join(root, 'plugins', 'warden'), { recursive: true });
  mkdirSync(join(root, 'plugins', 'console'), { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('GET /api/admin/plugins — removable', () => {
  it('marks only a plugin installed under plugins/<id> as removable', async () => {
    const res = await GET(new Request('http://localhost/api/admin/plugins'));
    const rows = (await res.json()) as { id: string; removable: boolean }[];
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.removable]));
    expect(byId).toEqual({
      'fs.sovereign.console': false,
      'com.example.addon': true,
      'fs.sovereign.warden': false,
    });
  });
});
