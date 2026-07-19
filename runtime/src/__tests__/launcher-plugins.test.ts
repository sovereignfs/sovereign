import { describe, expect, it } from 'vitest';
import type { SidebarPluginEntry } from '@sovereignfs/db';
import {
  applySidebarOrder,
  selectLauncherPlugins,
  selectSidebarPlugins,
  type LauncherPluginInput,
} from '../launcher-plugins';

const plugins: LauncherPluginInput[] = [
  { id: 'fs.sovereign.launcher', name: 'Launcher', routePrefix: '/launcher' },
  { id: 'fs.sovereign.console', name: 'Console', routePrefix: '/console', adminOnly: true },
  { id: 'fs.sovereign.account', name: 'Account', routePrefix: '/account' },
  { id: 'fs.example.tasks', name: 'Tasks', routePrefix: '/tasks', description: 'To-dos' },
  { id: 'fs.example.audit', name: 'Audit', routePrefix: '/audit', adminOnly: true },
];
const none = new Set<string>();

describe('selectLauncherPlugins', () => {
  it('excludes all three chrome plugins', () => {
    const ids = selectLauncherPlugins(plugins, none, 'platform:admin').map((p) => p.id);
    expect(ids).not.toContain('fs.sovereign.launcher');
    expect(ids).not.toContain('fs.sovereign.console');
    expect(ids).not.toContain('fs.sovereign.account');
  });

  it('returns non-chrome plugins for an admin, including admin-only ones', () => {
    const ids = selectLauncherPlugins(plugins, none, 'platform:admin').map((p) => p.id);
    expect(ids).toEqual(['fs.example.tasks', 'fs.example.audit']);
  });

  it('hides admin-only plugins from a regular user', () => {
    const result = selectLauncherPlugins(plugins, none, 'platform:user');
    expect(result.map((p) => p.id)).toEqual(['fs.example.tasks']);
    expect(result.every((p) => !p.adminOnly)).toBe(true);
  });

  it('excludes disabled plugins', () => {
    const disabled = new Set(['fs.example.tasks']);
    const ids = selectLauncherPlugins(plugins, disabled, 'platform:admin').map((p) => p.id);
    expect(ids).toEqual(['fs.example.audit']);
  });

  it('flags admin-only plugins and defaults the flag to false', () => {
    const result = selectLauncherPlugins(plugins, none, 'platform:admin');
    expect(result.find((p) => p.id === 'fs.example.audit')?.adminOnly).toBe(true);
    expect(result.find((p) => p.id === 'fs.example.tasks')?.adminOnly).toBe(false);
  });

  it('defaults a missing description to an empty string', () => {
    const result = selectLauncherPlugins(plugins, none, 'platform:admin');
    expect(result.find((p) => p.id === 'fs.example.audit')?.description).toBe('');
    expect(result.find((p) => p.id === 'fs.example.tasks')?.description).toBe('To-dos');
  });

  it('returns an empty list when only chrome plugins are installed', () => {
    const chromeOnly = plugins.filter((p) => p.id.startsWith('fs.sovereign.'));
    expect(selectLauncherPlugins(chromeOnly, none, 'platform:admin')).toEqual([]);
  });

  it('excludes access-policy-restricted plugins (RFC 0065)', () => {
    const restricted = new Set(['fs.example.tasks']);
    const ids = selectLauncherPlugins(plugins, none, 'platform:admin', restricted).map((p) => p.id);
    expect(ids).toEqual(['fs.example.audit']);
  });

  it('restriction applies even to an admin', () => {
    const restricted = new Set(['fs.example.audit']);
    const ids = selectLauncherPlugins(plugins, none, 'platform:admin', restricted).map((p) => p.id);
    expect(ids).toEqual(['fs.example.tasks']);
  });

  it('sorts development plugins last, preserving relative order otherwise', () => {
    const withDev: LauncherPluginInput[] = [
      { id: 'fs.example.beta', name: 'Beta', routePrefix: '/beta', development: true },
      { id: 'fs.example.tasks', name: 'Tasks', routePrefix: '/tasks' },
      { id: 'fs.example.audit', name: 'Audit', routePrefix: '/audit', adminOnly: true },
      { id: 'fs.example.alpha', name: 'Alpha', routePrefix: '/alpha', development: true },
    ];
    const ids = selectLauncherPlugins(withDev, none, 'platform:admin').map((p) => p.id);
    expect(ids).toEqual([
      'fs.example.tasks',
      'fs.example.audit',
      'fs.example.beta',
      'fs.example.alpha',
    ]);
  });
});

describe('selectSidebarPlugins', () => {
  it('excludes chrome plugins from the sidebar icons', () => {
    const ids = selectSidebarPlugins(plugins, none).map((p) => p.id);
    expect(ids).toEqual(['fs.example.tasks', 'fs.example.audit']);
  });

  it('excludes disabled plugins so no icon 404s', () => {
    const ids = selectSidebarPlugins(plugins, new Set(['fs.example.tasks'])).map((p) => p.id);
    expect(ids).toEqual(['fs.example.audit']);
  });

  it('preserves input order', () => {
    const reversed = [...plugins].reverse();
    const ids = selectSidebarPlugins(reversed, none).map((p) => p.id);
    expect(ids).toEqual(['fs.example.audit', 'fs.example.tasks']);
  });

  it('excludes access-policy-restricted plugins (RFC 0065)', () => {
    const restricted = new Set(['fs.example.audit']);
    const ids = selectSidebarPlugins(plugins, none, restricted).map((p) => p.id);
    expect(ids).toEqual(['fs.example.tasks']);
  });

  it('sorts development plugins last, preserving relative order otherwise', () => {
    const withDev: LauncherPluginInput[] = [
      { id: 'fs.example.beta', name: 'Beta', routePrefix: '/beta', development: true },
      { id: 'fs.example.tasks', name: 'Tasks', routePrefix: '/tasks' },
      { id: 'fs.example.audit', name: 'Audit', routePrefix: '/audit' },
      { id: 'fs.example.alpha', name: 'Alpha', routePrefix: '/alpha', development: true },
    ];
    const ids = selectSidebarPlugins(withDev, none).map((p) => p.id);
    expect(ids).toEqual([
      'fs.example.tasks',
      'fs.example.audit',
      'fs.example.beta',
      'fs.example.alpha',
    ]);
  });
});

describe('applySidebarOrder', () => {
  const items = [
    { id: 'tasks', name: 'Tasks' },
    { id: 'notes', name: 'Notes' },
    { id: 'audit', name: 'Audit' },
  ];

  it('returns the input unchanged when there is no saved preference', () => {
    expect(applySidebarOrder(items, null, { dropHidden: true })).toEqual(items);
  });

  it('reorders to match the saved preference', () => {
    const saved: SidebarPluginEntry[] = [
      { id: 'audit', hidden: false },
      { id: 'tasks', hidden: false },
      { id: 'notes', hidden: false },
    ];
    const ids = applySidebarOrder(items, saved, { dropHidden: true }).map((p) => p.id);
    expect(ids).toEqual(['audit', 'tasks', 'notes']);
  });

  it('drops hidden entries when dropHidden is true (sidebar chrome)', () => {
    const saved: SidebarPluginEntry[] = [
      { id: 'tasks', hidden: true },
      { id: 'notes', hidden: false },
      { id: 'audit', hidden: false },
    ];
    const ids = applySidebarOrder(items, saved, { dropHidden: true }).map((p) => p.id);
    expect(ids).toEqual(['notes', 'audit']);
  });

  it('keeps hidden entries, only reordered, when dropHidden is false (Launcher grid)', () => {
    const saved: SidebarPluginEntry[] = [
      { id: 'tasks', hidden: true },
      { id: 'notes', hidden: false },
      { id: 'audit', hidden: false },
    ];
    const ids = applySidebarOrder(items, saved, { dropHidden: false }).map((p) => p.id);
    expect(ids).toEqual(['tasks', 'notes', 'audit']);
  });

  it('appends a plugin not yet present in the saved list, in original order', () => {
    const saved: SidebarPluginEntry[] = [{ id: 'notes', hidden: false }];
    const ids = applySidebarOrder(items, saved, { dropHidden: true }).map((p) => p.id);
    expect(ids).toEqual(['notes', 'tasks', 'audit']);
  });

  it('silently drops a saved id absent from the input list (e.g. an admin-only plugin not visible to this caller)', () => {
    const saved: SidebarPluginEntry[] = [
      { id: 'admin-only', hidden: false },
      { id: 'audit', hidden: false },
      { id: 'tasks', hidden: false },
      { id: 'notes', hidden: false },
    ];
    const ids = applySidebarOrder(items, saved, { dropHidden: false }).map((p) => p.id);
    expect(ids).toEqual(['audit', 'tasks', 'notes']);
  });
});
