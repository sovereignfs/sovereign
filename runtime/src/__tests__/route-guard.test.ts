import { describe, expect, it } from 'vitest';
import {
  decidePluginRoute,
  matchedPublicPluginRouteId,
  underPrefix,
  type PluginRouteInfo,
} from '../route-guard';

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

  it('returns forbidden for an adminOnly plugin without console:access', () => {
    expect(decidePluginRoute('/console', plugins, none, 'platform:user')).toBe('forbidden');
    expect(decidePluginRoute('/console/users', plugins, none, 'platform:user')).toBe('forbidden');
  });

  it('allows an adminOnly plugin for roles with console:access', () => {
    expect(decidePluginRoute('/console', plugins, none, 'platform:admin')).toBe('ok');
    expect(decidePluginRoute('/console', plugins, none, 'platform:owner')).toBe('ok');
    expect(decidePluginRoute('/console', plugins, none, 'platform:auditor')).toBe('ok');
  });

  it('disabled wins over adminOnly — 404 even for admins', () => {
    const disabled = new Set(['fs.sovereign.console']);
    expect(decidePluginRoute('/console', plugins, disabled, 'platform:admin')).toBe('not-found');
  });

  it('does not leak adminOnly gating onto sibling prefixes', () => {
    expect(decidePluginRoute('/console2/anything', plugins, none, 'platform:user')).toBe('ok');
  });

  it('returns not-found for an access-policy-restricted plugin (RFC 0065)', () => {
    const restricted = new Set(['fs.sovereign.launcher']);
    expect(
      decidePluginRoute('/launcher', plugins, none, 'platform:user', undefined, restricted),
    ).toBe('not-found');
  });

  it('access-policy restriction wins over adminOnly — 404, not 403, even for a non-admin', () => {
    const restricted = new Set(['fs.sovereign.console']);
    expect(
      decidePluginRoute('/console', plugins, none, 'platform:user', undefined, restricted),
    ).toBe('not-found');
  });

  it('an admin denied by access policy still gets not-found, not the adminOnly ok path', () => {
    const restricted = new Set(['fs.sovereign.console']);
    expect(
      decidePluginRoute('/console', plugins, none, 'platform:admin', undefined, restricted),
    ).toBe('not-found');
  });

  it('restriction does not apply to a plugin not in the restricted set', () => {
    const restricted = new Set(['fs.sovereign.console']);
    expect(
      decidePluginRoute('/launcher', plugins, none, 'platform:user', undefined, restricted),
    ).toBe('ok');
  });
});

describe('matchedPublicPluginRouteId', () => {
  const blog: PluginRouteInfo = {
    id: 'com.example.blog',
    routePrefix: '/blog',
    publicRoutes: [{ prefix: '/p' }],
  };
  const withPublicRoutes = [console, launcher, blog];

  it('matches a path under a declared public route prefix', () => {
    expect(matchedPublicPluginRouteId('/blog/p/some-slug', withPublicRoutes)).toBe(
      'com.example.blog',
    );
    expect(matchedPublicPluginRouteId('/blog/p', withPublicRoutes)).toBe('com.example.blog');
  });

  it('does not match the plugin prefix outside the declared public sub-prefix', () => {
    expect(matchedPublicPluginRouteId('/blog/drafts', withPublicRoutes)).toBeNull();
    expect(matchedPublicPluginRouteId('/blog', withPublicRoutes)).toBeNull();
  });

  it('does not match a partial segment of the public prefix', () => {
    expect(matchedPublicPluginRouteId('/blog/p2/x', withPublicRoutes)).toBeNull();
  });

  it('returns null for plugins with no publicRoutes declared', () => {
    expect(matchedPublicPluginRouteId('/launcher', withPublicRoutes)).toBeNull();
    expect(matchedPublicPluginRouteId('/console', withPublicRoutes)).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(matchedPublicPluginRouteId('/', withPublicRoutes)).toBeNull();
    expect(matchedPublicPluginRouteId('/other', withPublicRoutes)).toBeNull();
  });
});
