import { describe, expect, it } from 'vitest';
import { decidePluginRoute, underPrefix, type PluginRouteInfo } from '../route-guard';

const console: PluginRouteInfo = {
  id: 'fs.sovereign.console',
  routePrefix: '/console',
  adminOnly: true,
};
const launcher: PluginRouteInfo = {
  id: 'fs.sovereign.launcher',
  routePrefix: '/launcher',
};
const plugins = [console, launcher];
const none = new Set<string>();

describe('underPrefix', () => {
  it('matches the prefix exactly', () => {
    expect(underPrefix('/console', '/console')).toBe(true);
  });

  it('matches nested paths', () => {
    expect(underPrefix('/console/users/invite', '/console')).toBe(true);
  });

  it('does not match a partial segment', () => {
    expect(underPrefix('/console2', '/console')).toBe(false);
    expect(underPrefix('/console2/users', '/console')).toBe(false);
  });

  it('does not match unrelated paths', () => {
    expect(underPrefix('/', '/console')).toBe(false);
    expect(underPrefix('/launcher', '/console')).toBe(false);
  });
});

describe('decidePluginRoute', () => {
  it('allows paths not under any plugin prefix', () => {
    expect(decidePluginRoute('/', plugins, none, 'platform:user')).toBe('ok');
    expect(decidePluginRoute('/settings', plugins, none, 'platform:user')).toBe('ok');
  });

  it('allows an enabled, non-adminOnly plugin for any role', () => {
    expect(decidePluginRoute('/launcher', plugins, none, 'platform:user')).toBe('ok');
  });

  it('returns not-found for a disabled plugin route', () => {
    const disabled = new Set(['fs.sovereign.launcher']);
    expect(decidePluginRoute('/launcher', plugins, disabled, 'platform:admin')).toBe('not-found');
    expect(decidePluginRoute('/launcher/sub/page', plugins, disabled, 'platform:admin')).toBe(
      'not-found',
    );
  });

  it('returns forbidden for an adminOnly plugin without platform:admin', () => {
    expect(decidePluginRoute('/console', plugins, none, 'platform:user')).toBe('forbidden');
    expect(decidePluginRoute('/console/users', plugins, none, 'platform:user')).toBe('forbidden');
  });

  it('allows an adminOnly plugin for platform:admin', () => {
    expect(decidePluginRoute('/console', plugins, none, 'platform:admin')).toBe('ok');
  });

  it('disabled wins over adminOnly — 404 even for admins', () => {
    const disabled = new Set(['fs.sovereign.console']);
    expect(decidePluginRoute('/console', plugins, disabled, 'platform:admin')).toBe('not-found');
  });

  it('does not leak adminOnly gating onto sibling prefixes', () => {
    expect(decidePluginRoute('/console2/anything', plugins, none, 'platform:user')).toBe('ok');
  });
});
