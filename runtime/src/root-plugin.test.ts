import { describe, expect, it } from 'vitest';
import { resolveRootRoutePrefix, validateRootPlugin } from './root-plugin';
import type { PluginRouteInfo } from './route-guard';

const plugins: PluginRouteInfo[] = [
  { id: 'fs.sovereign.console', routePrefix: '/console', adminOnly: true, shell: 'overlay' },
  { id: 'fs.sovereign.account', routePrefix: '/account', shell: 'overlay' },
  { id: 'fs.sovereign.launcher', routePrefix: '/launcher' },
  { id: 'fs.example.tasks', routePrefix: '/tasks' },
];
const none = new Set<string>();

describe('validateRootPlugin', () => {
  it('accepts an installed, enabled, non-adminOnly plugin', () => {
    expect(validateRootPlugin('fs.sovereign.launcher', plugins, none)).toEqual({ ok: true });
    expect(validateRootPlugin('fs.example.tasks', plugins, none)).toEqual({ ok: true });
  });

  it('rejects a plugin that is not installed', () => {
    expect(validateRootPlugin('fs.missing', plugins, none)).toEqual({
      ok: false,
      reason: 'not-installed',
    });
  });

  it('rejects a disabled plugin', () => {
    const disabled = new Set(['fs.example.tasks']);
    expect(validateRootPlugin('fs.example.tasks', plugins, disabled)).toEqual({
      ok: false,
      reason: 'disabled',
    });
  });

  it('rejects an adminOnly plugin', () => {
    expect(validateRootPlugin('fs.sovereign.console', plugins, none)).toEqual({
      ok: false,
      reason: 'admin-only',
    });
  });

  it('rejects an overlay plugin (RFC 0001 — root serves a full page)', () => {
    expect(validateRootPlugin('fs.sovereign.account', plugins, none)).toEqual({
      ok: false,
      reason: 'overlay',
    });
  });
});

describe('resolveRootRoutePrefix', () => {
  it('returns the routePrefix for a valid root plugin', () => {
    expect(resolveRootRoutePrefix('fs.sovereign.launcher', plugins, none)).toBe('/launcher');
    expect(resolveRootRoutePrefix('fs.example.tasks', plugins, none)).toBe('/tasks');
  });

  it('returns null when the root plugin is not installed', () => {
    expect(resolveRootRoutePrefix('fs.missing', plugins, none)).toBeNull();
  });

  it('returns null when the root plugin is disabled', () => {
    expect(
      resolveRootRoutePrefix('fs.example.tasks', plugins, new Set(['fs.example.tasks'])),
    ).toBeNull();
  });

  it('returns null when the root plugin is admin-only', () => {
    expect(resolveRootRoutePrefix('fs.sovereign.console', plugins, none)).toBeNull();
  });
});
