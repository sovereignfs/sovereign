import { describe, expect, it } from 'vitest';
import {
  decidePluginRoute,
  matchedPublicHandoffRoute,
  matchedPublicPluginRouteId,
  matchedWebhookRoute,
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

describe('decidePluginRoute — surfaces (RFC 0080)', () => {
  const mobileOnly: PluginRouteInfo = {
    id: 'com.example.scanner',
    routePrefix: '/scanner',
    surfaces: ['mobile'],
  };
  const withSurfaces = [console, launcher, mobileOnly];
  const none = new Set<string>();

  it('returns unavailable-surface when the current surface is not declared', () => {
    expect(
      decidePluginRoute(
        '/scanner',
        withSurfaces,
        none,
        'platform:user',
        undefined,
        undefined,
        'desktop',
      ),
    ).toBe('unavailable-surface');
  });

  it('allows the plugin on a declared surface', () => {
    expect(
      decidePluginRoute(
        '/scanner',
        withSurfaces,
        none,
        'platform:user',
        undefined,
        undefined,
        'mobile',
      ),
    ).toBe('ok');
  });

  it('allows a plugin with no surfaces declared, regardless of current surface', () => {
    expect(
      decidePluginRoute(
        '/launcher',
        withSurfaces,
        none,
        'platform:user',
        undefined,
        undefined,
        'desktop',
      ),
    ).toBe('ok');
  });

  it('is a no-op when currentSurface is not supplied (backward compatible)', () => {
    expect(decidePluginRoute('/scanner', withSurfaces, none, 'platform:user')).toBe('ok');
  });

  it('disabled wins over surface unavailability', () => {
    const disabled = new Set(['com.example.scanner']);
    expect(
      decidePluginRoute(
        '/scanner',
        withSurfaces,
        disabled,
        'platform:user',
        undefined,
        undefined,
        'desktop',
      ),
    ).toBe('not-found');
  });

  it('paywall wins over surface unavailability', () => {
    const paywalled = new Set(['com.example.scanner']);
    expect(
      decidePluginRoute(
        '/scanner',
        withSurfaces,
        none,
        'platform:user',
        paywalled,
        undefined,
        'desktop',
      ),
    ).toBe('paywall');
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

describe('matchedPublicPluginRouteId — public: true (RFC 0089)', () => {
  const status: PluginRouteInfo = {
    id: 'com.example.status',
    routePrefix: '/status',
    shell: 'minimal',
    public: true,
  };
  const withFullyPublic = [console, launcher, status];

  it('matches the bare routePrefix', () => {
    expect(matchedPublicPluginRouteId('/status', withFullyPublic)).toBe('com.example.status');
  });

  it('matches every path under the routePrefix', () => {
    expect(matchedPublicPluginRouteId('/status/incidents/42', withFullyPublic)).toBe(
      'com.example.status',
    );
  });

  it('does not match other plugins', () => {
    expect(matchedPublicPluginRouteId('/launcher', withFullyPublic)).toBeNull();
    expect(matchedPublicPluginRouteId('/console', withFullyPublic)).toBeNull();
  });

  it('does not match a plugin with public left unset', () => {
    const blog: PluginRouteInfo = { id: 'com.example.blog', routePrefix: '/blog' };
    expect(matchedPublicPluginRouteId('/blog', [blog])).toBeNull();
  });
});

describe('matchedWebhookRoute', () => {
  const provider: PluginRouteInfo = {
    id: 'com.example.provider',
    routePrefix: '/provider',
    webhooks: [
      { path: '/webhooks/deliver', methods: ['POST'], maxBodyBytes: 262144 },
      { path: '/webhooks/verify', methods: ['GET'], maxBodyBytes: 262144 },
    ],
  };
  const withWebhooks = [console, launcher, provider];

  it('matches an exact declared webhook path', () => {
    const result = matchedWebhookRoute('/provider/webhooks/deliver', withWebhooks);
    expect(result?.pluginId).toBe('com.example.provider');
    expect(result?.webhook.methods).toEqual(['POST']);
  });

  it('matches a second declared webhook on the same plugin independently', () => {
    const result = matchedWebhookRoute('/provider/webhooks/verify', withWebhooks);
    expect(result?.webhook.methods).toEqual(['GET']);
  });

  it('does not match a sub-path of a declared webhook (exact match only, unlike publicRoutes)', () => {
    expect(matchedWebhookRoute('/provider/webhooks/deliver/extra', withWebhooks)).toBeNull();
  });

  it('does not match the bare routePrefix', () => {
    expect(matchedWebhookRoute('/provider', withWebhooks)).toBeNull();
  });

  it('returns null for plugins with no webhooks declared', () => {
    expect(matchedWebhookRoute('/launcher', withWebhooks)).toBeNull();
    expect(matchedWebhookRoute('/console', withWebhooks)).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(matchedWebhookRoute('/', withWebhooks)).toBeNull();
    expect(matchedWebhookRoute('/other', withWebhooks)).toBeNull();
  });

  it('does not confuse one plugin webhook path with a similarly-named path on another plugin', () => {
    const other: PluginRouteInfo = {
      id: 'com.example.other',
      routePrefix: '/other-provider',
      webhooks: [{ path: '/webhooks/deliver', methods: ['POST'], maxBodyBytes: 262144 }],
    };
    const result = matchedWebhookRoute('/other-provider/webhooks/deliver', [provider, other]);
    expect(result?.pluginId).toBe('com.example.other');
  });
});

describe('matchedPublicHandoffRoute (RFC 0053)', () => {
  const checkout: PluginRouteInfo = {
    id: 'com.example.checkout',
    routePrefix: '/checkout',
    handoffs: {
      receives: [
        { name: 'checkout-session', path: '/cart', public: true },
        { name: 'internal-flow', path: '/internal', public: false },
      ],
    },
  };
  const withHandoffs = [console, launcher, checkout];

  it('matches an exact declared public receiver path', () => {
    const result = matchedPublicHandoffRoute('/checkout/cart', withHandoffs);
    expect(result?.pluginId).toBe('com.example.checkout');
    expect(result?.receiver.name).toBe('checkout-session');
  });

  it('does not match a receiver declared public: false', () => {
    expect(matchedPublicHandoffRoute('/checkout/internal', withHandoffs)).toBeNull();
  });

  it('does not match a sub-path of a declared receiver (exact match only)', () => {
    expect(matchedPublicHandoffRoute('/checkout/cart/extra', withHandoffs)).toBeNull();
  });

  it('does not match the bare routePrefix', () => {
    expect(matchedPublicHandoffRoute('/checkout', withHandoffs)).toBeNull();
  });

  it('returns null for plugins with no handoffs declared', () => {
    expect(matchedPublicHandoffRoute('/launcher', withHandoffs)).toBeNull();
    expect(matchedPublicHandoffRoute('/console', withHandoffs)).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(matchedPublicHandoffRoute('/', withHandoffs)).toBeNull();
    expect(matchedPublicHandoffRoute('/other', withHandoffs)).toBeNull();
  });
});

// decidePluginRoute is the general-purpose route decision function, used
// directly by the *authenticated* gate in middleware.ts. The public-route
// fast path (matchedPublicPluginRouteId's callers) takes a separate branch
// in middleware.ts that only checks disabled-plugin status, not restriction —
// see the "fully public plugins" describe block in middleware-regression.test.ts
// for what actually happens on a real request. These tests cover
// decidePluginRoute's own precedence in isolation, independent of which
// callers currently exercise it for a public: true plugin.
describe('decidePluginRoute — public: true plugins (RFC 0089)', () => {
  const status: PluginRouteInfo = {
    id: 'com.example.status',
    routePrefix: '/status',
    shell: 'minimal',
    public: true,
  };
  const withFullyPublic = [console, launcher, status];
  const none = new Set<string>();

  it('resolves ok for a fully public plugin', () => {
    expect(decidePluginRoute('/status', withFullyPublic, none, 'platform:user')).toBe('ok');
  });

  it('resolves not-found when the fully public plugin is disabled', () => {
    const disabled = new Set(['com.example.status']);
    expect(decidePluginRoute('/status', withFullyPublic, disabled, 'platform:user')).toBe(
      'not-found',
    );
  });

  it('resolves not-found when the fully public plugin is access-restricted', () => {
    const restricted = new Set(['com.example.status']);
    expect(
      decidePluginRoute('/status', withFullyPublic, none, 'platform:user', undefined, restricted),
    ).toBe('not-found');
  });
});
