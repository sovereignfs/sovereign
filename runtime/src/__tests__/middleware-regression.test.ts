import type { SovereignManifest } from '@sovereignfs/manifest';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGlobalRateLimitForTests } from '../rate-limit';
import type { VerifiedSession } from '../session-verify';

const mockState = vi.hoisted(() => ({
  installedPlugins: [] as SovereignManifest[],
}));

vi.mock('better-auth/cookies', () => ({
  getCookieCache: () => Promise.resolve(null),
}));

vi.mock('@/generated/plugin-capabilities', () => ({
  ALL_GRANTED_PLUGIN_CAPS: [],
}));

vi.mock('@/src/api-namespace', async () => import('../api-namespace'));

vi.mock('@/src/capabilities', async () => import('../capabilities'));

vi.mock('@/src/dev-mode', async () => import('../dev-mode'));

vi.mock('@/src/registry', async () => {
  const actual = await import('../registry');
  return { ...actual, getInstalledPlugins: () => mockState.installedPlugins };
});

vi.mock('@/src/rate-limit', async () => import('../rate-limit'));

vi.mock('@/src/route-guard', async () => import('../route-guard'));

vi.mock('@/src/security', async () => import('../security'));

vi.mock('@/src/surface', async () => import('../surface'));

vi.mock('@/src/session-verify', async () => import('../session-verify'));

const { middleware, config } = await import('../../middleware');

const consolePlugin = {
  id: 'fs.sovereign.console',
  routePrefix: '/console',
  adminOnly: true,
} as SovereignManifest;

const launcherPlugin = {
  id: 'fs.sovereign.launcher',
  routePrefix: '/launcher',
} as SovereignManifest;

const paidPlugin = {
  id: 'fs.example.paid',
  routePrefix: '/paid',
} as SovereignManifest;

const apiProviderPlugin = {
  id: 'fs.sovereign.api-composer',
  routePrefix: '/api-composer',
  apiProvider: true,
} as SovereignManifest;

const apiShapedPlugin = {
  id: 'fs.example.api-shaped',
  routePrefix: '/api/plugins/example',
} as SovereignManifest;

// Prefix starts with a *reserved* /api/ segment ("admin") so it is exempt
// from the public /api/* namespace delegation (PLT-16, api-namespace.ts) and
// falls through to the normal session-gated plugin route decision below —
// same trick apiShapedPlugin above uses with the "plugins" segment.
const adminApiShapedPlugin = {
  id: 'fs.example.admin-api-shaped',
  routePrefix: '/api/admin/console-tools',
  adminOnly: true,
} as SovereignManifest;

const publicRoutePlugin = {
  id: 'com.example.blog',
  routePrefix: '/blog',
  publicRoutes: [{ prefix: '/p' }],
} as SovereignManifest;

const offlineRoutePlugin = {
  id: 'com.example.shopper',
  routePrefix: '/shopper',
  offline: true,
} as SovereignManifest;

const mobileChromePlugin = {
  id: 'com.example.canvas',
  routePrefix: '/canvas',
  shellConfig: { mobileHeader: false, mobileFooter: false },
} as SovereignManifest;

const paidPublicRoutePlugin = {
  id: 'com.example.paid-blog',
  routePrefix: '/paid-blog',
  publicRoutes: [{ prefix: '/p' }],
  monetization: { model: 'one_time' },
} as SovereignManifest;

const fullyPublicPlugin = {
  id: 'com.example.status',
  routePrefix: '/status',
  shell: 'minimal',
  public: true,
} as SovereignManifest;

function session(role: string = 'platform:owner'): VerifiedSession {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.test',
      name: 'Test User',
      image: null,
      role,
      timezone: null,
    },
    expiresAt: 4_102_444_800,
  };
}

type FetchState = {
  session: VerifiedSession | null;
  disabledIds: string[] | Error;
  paywalledIds: string[] | Error;
  restrictedIds: string[] | Error;
  rootPrefix: string | null | Error;
  calls: string[];
};

function installFetchMock(state: FetchState): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      state.calls.push(url);

      if (url.endsWith('/api/verify')) {
        if (!state.session) return { ok: false, headers: { getSetCookie: () => [] } };
        return {
          ok: true,
          json: async () => state.session,
          headers: { getSetCookie: () => ['better-auth.session_data=test'] },
        };
      }

      if (url.includes('/api/admin/plugins/disabled')) {
        if (state.disabledIds instanceof Error) throw state.disabledIds;
        return { ok: true, json: async () => ({ disabled: state.disabledIds }) };
      }

      if (url.includes('/api/admin/entitlements')) {
        if (state.paywalledIds instanceof Error) throw state.paywalledIds;
        return { ok: true, json: async () => ({ paywalled: state.paywalledIds }) };
      }

      if (url.includes('/api/admin/plugins/access')) {
        if (state.restrictedIds instanceof Error) throw state.restrictedIds;
        return { ok: true, json: async () => ({ restricted: state.restrictedIds }) };
      }

      if (url.includes('/api/admin/root-plugin')) {
        if (state.rootPrefix instanceof Error) throw state.rootPrefix;
        return { ok: true, json: async () => ({ routePrefix: state.rootPrefix }) };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

function request(
  path: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  return new NextRequest(`http://runtime.test${path}`, init);
}

function middlewareRewrite(response: Response): string | null {
  return response.headers.get('x-middleware-rewrite');
}

describe('runtime middleware regressions', () => {
  let fetchState: FetchState;

  beforeEach(() => {
    mockState.installedPlugins = [
      consolePlugin,
      launcherPlugin,
      paidPlugin,
      apiProviderPlugin,
      apiShapedPlugin,
      adminApiShapedPlugin,
      publicRoutePlugin,
      paidPublicRoutePlugin,
      fullyPublicPlugin,
      offlineRoutePlugin,
      mobileChromePlugin,
    ];
    fetchState = {
      session: session(),
      disabledIds: [],
      paywalledIds: [],
      restrictedIds: [],
      rootPrefix: null,
      calls: [],
    };
    installFetchMock(fetchState);
    resetGlobalRateLimitForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SOVEREIGN_RATE_LIMIT_DISABLED;
    delete process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS;
  });

  it('fails closed by redirecting unauthenticated POST requests to /login with 303', async () => {
    fetchState.session = null;

    const response = await middleware(request('/launcher/settings', { method: 'POST' }));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://runtime.test/login?returnUrl=%2Flauncher%2Fsettings',
    );
    expect(fetchState.calls).toContain('http://localhost:3001/api/verify');
  });

  it('carries the original path as returnUrl on the /login redirect', async () => {
    fetchState.session = null;

    const response = await middleware(request('/launcher/settings?tab=general'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://runtime.test/login?returnUrl=%2Flauncher%2Fsettings%3Ftab%3Dgeneral',
    );
  });

  it('redirects non-admin Console page access to /forbidden with 303', async () => {
    fetchState.session = session('platform:user');

    const response = await middleware(request('/console/users'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://runtime.test/forbidden');
  });

  it('returns raw 403 for a non-admin request to an API-shaped adminOnly plugin', async () => {
    fetchState.session = session('platform:user');

    const response = await middleware(request('/api/admin/console-tools/users'));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('Forbidden');
  });

  it('rewrites disabled plugin page routes to /__not-found', async () => {
    fetchState.disabledIds = [launcherPlugin.id];

    const response = await middleware(request('/launcher'));

    expect(response.status).toBe(200);
    expect(middlewareRewrite(response)).toBe('http://runtime.test/__not-found');
  });

  it('returns raw 404 for a disabled API-shaped plugin route', async () => {
    fetchState.disabledIds = [apiShapedPlugin.id];

    const response = await middleware(request('/api/plugins/example/run'));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
  });

  it('rewrites access-policy-restricted plugin page routes to /__not-found (RFC 0065)', async () => {
    fetchState.restrictedIds = [launcherPlugin.id];

    const response = await middleware(request('/launcher'));

    expect(response.status).toBe(200);
    expect(middlewareRewrite(response)).toBe('http://runtime.test/__not-found');
  });

  it('access-policy restriction rewrites to /__not-found, not /forbidden, even for an adminOnly plugin', async () => {
    fetchState.restrictedIds = [consolePlugin.id];
    fetchState.session = session('platform:admin');

    const response = await middleware(request('/console'));

    expect(response.status).toBe(200);
    expect(middlewareRewrite(response)).toBe('http://runtime.test/__not-found');
  });

  it('redirects paywalled plugin page routes to the plugin paywall', async () => {
    fetchState.paywalledIds = [paidPlugin.id];

    const response = await middleware(request('/paid/reports'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://runtime.test/paywall/fs.example.paid');
  });

  it('returns 402 for paywalled plugin API-shaped routes', async () => {
    fetchState.paywalledIds = [apiShapedPlugin.id];

    const response = await middleware(request('/api/plugins/example/run'));

    expect(response.status).toBe(402);
    expect(await response.text()).toBe('Payment Required');
  });

  it('rewrites unauthenticated GET / to /login instead of redirecting (iOS PWA splash)', async () => {
    fetchState.session = null;

    const response = await middleware(request('/'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(middlewareRewrite(response)).toBe('http://runtime.test/login');
  });

  it('still redirects unauthenticated non-GET / with 303, not a method-preserving rewrite', async () => {
    fetchState.session = null;

    const response = await middleware(request('/', { method: 'POST' }));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://runtime.test/login');
  });

  it('rewrites / to the configured root plugin after authentication', async () => {
    fetchState.rootPrefix = '/launcher';

    const response = await middleware(request('/'));

    expect(response.status).toBe(200);
    expect(middlewareRewrite(response)).toBe('http://runtime.test/launcher');
  });

  it('delegates public /api/* requests before auth verification', async () => {
    fetchState.session = null;

    const response = await middleware(request('/api/blog/posts/1?draft=1'));

    expect(response.status).toBe(200);
    expect(middlewareRewrite(response)).toBe(
      'http://runtime.test/api-composer/serve/blog/posts/1?draft=1',
    );
    expect(fetchState.calls).toEqual(['http://localhost:3000/api/admin/plugins/disabled']);
  });

  it('fails open when disabled-plugin, paywall, and access-policy status fetches fail', async () => {
    fetchState.disabledIds = new Error('disabled fetch unavailable');
    fetchState.paywalledIds = new Error('paywall fetch unavailable');
    fetchState.restrictedIds = new Error('access fetch unavailable');

    const response = await middleware(request('/launcher'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toBe('');
  });

  it('falls through / when root-plugin lookup fails', async () => {
    fetchState.rootPrefix = new Error('root plugin lookup unavailable');

    const response = await middleware(request('/'));

    expect(response.status).toBe(200);
    expect(middlewareRewrite(response)).toBeNull();
  });

  it('passes the user id and role through to the root-plugin lookup', async () => {
    fetchState.rootPrefix = '/launcher';
    fetchState.session = session('platform:admin');

    await middleware(request('/'));

    const rootCall = fetchState.calls.find((c) => c.includes('/api/admin/root-plugin'));
    expect(rootCall).toContain('userId=user-1');
    expect(rootCall).toContain('role=platform%3Aadmin');
  });

  describe('x-sovereign-surface (RFC 0080)', () => {
    it('resolves the native shell surface for an authenticated request', async () => {
      const response = await middleware(
        request('/launcher', { headers: { 'user-agent': 'Sovereign-Shell/mobile-ios 1.0.0' } }),
      );

      expect(response.headers.get('x-middleware-request-x-sovereign-surface')).toBe('mobile');
      expect(response.headers.get('x-middleware-request-x-sovereign-shell-version')).toBe('1.0.0');
    });

    it('resolves browser and strips a forged inbound header for an ordinary request', async () => {
      const response = await middleware(
        request('/launcher', { headers: { 'x-sovereign-surface': 'desktop' } }),
      );

      expect(response.headers.get('x-middleware-request-x-sovereign-surface')).toBe('browser');
      expect(response.headers.get('x-middleware-request-x-sovereign-shell-version')).toBeNull();
    });

    it('resolves the surface for a public plugin route request', async () => {
      const response = await middleware(
        request('/blog/p/hello', {
          headers: { 'user-agent': 'Sovereign-Shell/desktop-macos 2.0.0' },
        }),
      );

      expect(response.headers.get('x-middleware-request-x-sovereign-surface')).toBe('desktop');
      expect(response.headers.get('x-middleware-request-x-sovereign-shell-version')).toBe('2.0.0');
    });

    it('resolves the surface for a public /api/* namespace request', async () => {
      fetchState.session = null;

      const response = await middleware(
        request('/api/blog/posts/1', {
          headers: { 'user-agent': 'Sovereign-Shell/mobile-android 3.1.0' },
        }),
      );

      expect(middlewareRewrite(response)).toBe(
        'http://runtime.test/api-composer/serve/blog/posts/1',
      );
      expect(response.headers.get('x-middleware-request-x-sovereign-surface')).toBe('mobile');
      expect(response.headers.get('x-middleware-request-x-sovereign-shell-version')).toBe('3.1.0');
    });
  });

  describe('offline route flag (RFC 0074, RFC 0078)', () => {
    it("flags a request to an offline-enabled plugin's bare routePrefix", async () => {
      const response = await middleware(request('/shopper'));

      expect(response.headers.get('x-middleware-request-x-sovereign-offline-route')).toBe('1');
    });

    it('does not flag a sub-route on the same plugin — only the bare routePrefix is offline-capable', async () => {
      const response = await middleware(request('/shopper/lists/abc'));

      expect(response.headers.get('x-middleware-request-x-sovereign-offline-route')).toBeNull();
    });

    it('does not flag a request to a plugin with offline not declared', async () => {
      const response = await middleware(request('/paid'));

      expect(response.headers.get('x-middleware-request-x-sovereign-offline-route')).toBeNull();
    });

    it('does not flag bare "/" — it renders the normal per-user SSR shell', async () => {
      const response = await middleware(request('/'));

      expect(response.headers.get('x-middleware-request-x-sovereign-offline-route')).toBeNull();
    });
  });

  describe('mobile chrome flags (RFC 0075)', () => {
    it('flags both header and footer hidden for a plugin declaring both false', async () => {
      const response = await middleware(request('/canvas'));

      expect(response.headers.get('x-middleware-request-x-sovereign-mobile-header')).toBe('0');
      expect(response.headers.get('x-middleware-request-x-sovereign-mobile-footer')).toBe('0');
    });

    it('flags a nested route under the plugin prefix the same way', async () => {
      const response = await middleware(request('/canvas/doc/1'));

      expect(response.headers.get('x-middleware-request-x-sovereign-mobile-header')).toBe('0');
      expect(response.headers.get('x-middleware-request-x-sovereign-mobile-footer')).toBe('0');
    });

    it('does not flag a plugin with no shellConfig override', async () => {
      const response = await middleware(request('/launcher'));

      expect(response.headers.get('x-middleware-request-x-sovereign-mobile-header')).toBeNull();
      expect(response.headers.get('x-middleware-request-x-sovereign-mobile-footer')).toBeNull();
    });

    it('does not flag bare "/" ', async () => {
      const response = await middleware(request('/'));

      expect(response.headers.get('x-middleware-request-x-sovereign-mobile-header')).toBeNull();
      expect(response.headers.get('x-middleware-request-x-sovereign-mobile-footer')).toBeNull();
    });
  });

  describe('public plugin page routes (RFC 0042)', () => {
    it('allows unauthenticated access to a manifest-declared public route', async () => {
      fetchState.session = null;

      const response = await middleware(request('/blog/p/some-slug'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-request-x-sovereign-user-id')).toBeNull();
    });

    it('still redirects to /login for an undeclared page under the same plugin', async () => {
      fetchState.session = null;

      const response = await middleware(request('/blog/drafts'));

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(
        'http://runtime.test/login?returnUrl=%2Fblog%2Fdrafts',
      );
    });

    it('returns 404 for a disabled plugin’s public route', async () => {
      fetchState.session = null;
      fetchState.disabledIds = [publicRoutePlugin.id];

      const response = await middleware(request('/blog/p/some-slug'));

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('injects session headers when a valid session exists for a public route', async () => {
      fetchState.session = session('platform:user');

      const response = await middleware(request('/blog/p/some-slug'));

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-sovereign-user-id')).toBe('user-1');
      expect(response.headers.get('x-middleware-request-x-sovereign-plugin-id')).toBe(
        publicRoutePlugin.id,
      );
    });

    it('blocks anonymous access to a monetized plugin’s public route by default', async () => {
      fetchState.session = null;

      const response = await middleware(request('/paid-blog/p/some-slug'));

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(
        'http://runtime.test/paywall/com.example.paid-blog',
      );
    });

    it('redirects an authenticated, non-entitled user to the paywall for a monetized public route', async () => {
      fetchState.session = session();
      fetchState.paywalledIds = [paidPublicRoutePlugin.id];

      const response = await middleware(request('/paid-blog/p/some-slug'));

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(
        'http://runtime.test/paywall/com.example.paid-blog',
      );
    });

    it('allows an authenticated, entitled user through to a monetized public route', async () => {
      fetchState.session = session();
      fetchState.paywalledIds = [];

      const response = await middleware(request('/paid-blog/p/some-slug'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('fully public plugins (RFC 0089)', () => {
    it('allows unauthenticated access to the bare routePrefix', async () => {
      fetchState.session = null;

      const response = await middleware(request('/status'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-request-x-sovereign-user-id')).toBeNull();
    });

    it('allows unauthenticated access to every nested path under the plugin', async () => {
      fetchState.session = null;

      const response = await middleware(request('/status/incidents/42'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('returns 404 for a disabled fully public plugin', async () => {
      fetchState.session = null;
      fetchState.disabledIds = [fullyPublicPlugin.id];

      const response = await middleware(request('/status'));

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    // The RFC 0042/0089 public-route fast path in middleware.ts only checks
    // disabledIds, never restrictedIds — RFC 0065 access policy is not
    // consulted here, same as it already isn't for `publicRoutes`. This is a
    // pre-existing property of the shared fast path, not something this task
    // changes; see RFC 0089's "Current state" section.
    it('does not consult RFC 0065 access policy on the public fast path', async () => {
      fetchState.session = null;
      fetchState.restrictedIds = [fullyPublicPlugin.id];

      const response = await middleware(request('/status'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('injects session headers when a valid session exists', async () => {
      fetchState.session = session('platform:user');

      const response = await middleware(request('/status'));

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-sovereign-user-id')).toBe('user-1');
      expect(response.headers.get('x-middleware-request-x-sovereign-plugin-id')).toBe(
        fullyPublicPlugin.id,
      );
    });
  });

  describe('forged x-sovereign-* header stripping', () => {
    const forgedHeaders = {
      'x-sovereign-user-id': 'attacker',
      'x-sovereign-user-role': 'platform:owner',
      'x-sovereign-user-email': 'attacker@example.test',
      'x-sovereign-user-capabilities': '["console:access"]',
      'x-sovereign-plugin-id': publicRoutePlugin.id,
    };

    it('strips a forged header on the public /api/* rewrite (no session, no plugin auth of its own)', async () => {
      fetchState.session = null;

      const response = await middleware(request('/api/blog/posts/1', { headers: forgedHeaders }));

      expect(response.status).toBe(200);
      expect(middlewareRewrite(response)).toBe(
        'http://runtime.test/api-composer/serve/blog/posts/1',
      );
      for (const name of Object.keys(forgedHeaders)) {
        expect(response.headers.get(`x-middleware-request-${name}`)).toBeNull();
      }
    });

    it('strips a forged header on an anonymous manifest-declared public route', async () => {
      fetchState.session = null;

      const response = await middleware(request('/blog/p/some-slug', { headers: forgedHeaders }));

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-sovereign-user-id')).toBeNull();
      expect(response.headers.get('x-middleware-request-x-sovereign-user-role')).toBeNull();
      expect(response.headers.get('x-middleware-request-x-sovereign-user-email')).toBeNull();
      expect(response.headers.get('x-middleware-request-x-sovereign-user-capabilities')).toBeNull();
      // The real plugin id for this route is still injected — only the
      // forger's attempted override of it is what must not survive.
      expect(response.headers.get('x-middleware-request-x-sovereign-plugin-id')).toBe(
        publicRoutePlugin.id,
      );
    });

    it('replaces (does not merge with) a forged header on an authenticated public route with a session', async () => {
      fetchState.session = session('platform:user');

      const response = await middleware(
        request('/blog/p/some-slug', {
          headers: { ...forgedHeaders, 'x-sovereign-user-role': 'platform:owner' },
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-sovereign-user-id')).toBe('user-1');
      expect(response.headers.get('x-middleware-request-x-sovereign-user-role')).toBe(
        'platform:user',
      );
    });

    it('strips a forged x-sovereign-plugin-id on an authenticated route outside any plugin prefix', async () => {
      // `/account` isn't under any installed plugin's routePrefix, so the
      // normal gate's `if (currentPlugin) headers.set(...)` never runs —
      // a bare clone would let the forged value through untouched.
      const response = await middleware(
        request('/account', { headers: { 'x-sovereign-plugin-id': 'com.attacker.evil' } }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-sovereign-plugin-id')).toBeNull();
    });

    it('replaces a forged x-sovereign-user-name with the real session value', async () => {
      const response = await middleware(
        request('/launcher', { headers: { 'x-sovereign-user-name': 'Forged Name' } }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-sovereign-user-name')).toBe('Test User');
    });

    it('strips a forged x-sovereign-user-image on an authenticated route (session has none)', async () => {
      const response = await middleware(
        request('/launcher', {
          headers: { 'x-sovereign-user-image': 'https://attacker.test/avatar.png' },
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-sovereign-user-image')).toBeNull();
    });
  });

  describe('/api/instance branding — public GET, gated mutation', () => {
    // Regression: `api/instance` was previously excluded from the matcher
    // entirely (like sw.js/manifest.json), so middleware never ran on this
    // path at all — including its POST/DELETE. `/api/instance/logo` and
    // `/api/instance/favicon`'s route handlers authorize solely on
    // `request.headers.get('x-sovereign-user-role')`, so a caller with no
    // session could forge `x-sovereign-user-role: platform:owner` and it
    // reached the handler untouched. Reproduced against a live instance with
    // plain curl (`POST -H 'x-sovereign-user-role: platform:owner'` with no
    // cookie returned 400 "no file provided", not 403 — proving the header
    // survived and the auth check passed). Fixed by keeping the path inside
    // the matcher and only carving out public GET (PUBLIC_INSTANCE_GET_PATHS
    // in middleware.ts), so POST/DELETE fall through to the same
    // session-verification-then-header-injection flow every other
    // authenticated route gets.
    it.each(['/api/instance', '/api/instance/logo', '/api/instance/favicon'])(
      'serves GET %s with no session (must load before login)',
      async (path) => {
        fetchState.session = null;

        const response = await middleware(request(path));

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
      },
    );

    it('serves HEAD /api/instance/logo with no session', async () => {
      fetchState.session = null;

      const response = await middleware(request('/api/instance/logo', { method: 'HEAD' }));

      expect(response.status).toBe(200);
    });

    it.each(['POST', 'DELETE'])(
      '%s /api/instance/logo with a forged owner header and no session redirects to /login rather than forwarding the header',
      async (method) => {
        fetchState.session = null;

        const response = await middleware(
          request('/api/instance/logo', {
            method,
            headers: { 'x-sovereign-user-role': 'platform:owner' },
          }),
        );

        expect(response.status).toBe(303);
        expect(response.headers.get('location')).toBe(
          'http://runtime.test/login?returnUrl=%2Fapi%2Finstance%2Flogo',
        );
        // The response is a redirect, not a forwarded request — nothing was
        // ever passed downstream, forged header included.
        expect(response.headers.get('x-middleware-request-x-sovereign-user-role')).toBeNull();
      },
    );

    it('replaces a forged owner header with the real, lower-privileged session role on POST /api/instance/favicon', async () => {
      fetchState.session = session('platform:user');

      const response = await middleware(
        request('/api/instance/favicon', {
          method: 'POST',
          headers: { 'x-sovereign-user-role': 'platform:owner' },
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-sovereign-user-role')).toBe(
        'platform:user',
      );
    });
  });

  describe('rate limiting', () => {
    it('allows requests under the configured max', async () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = '2';

      const first = await middleware(request('/launcher'));
      const second = await middleware(request('/launcher'));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });

    it('returns 429 with Retry-After and the CSP header once the per-IP max is exceeded', async () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = '1';

      const first = await middleware(request('/launcher'));
      const second = await middleware(request('/launcher'));

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(await second.text()).toBe('Too Many Requests');
      expect(second.headers.get('Retry-After')).toBeTruthy();
      expect(second.headers.get('content-security-policy')).toBeTruthy();
    });

    it('short-circuits before any downstream work — no fetch is made once rate-limited', async () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = '1';
      fetchState.calls = [];

      await middleware(request('/launcher'));
      fetchState.calls = [];
      const limited = await middleware(request('/launcher'));

      expect(limited.status).toBe(429);
      expect(fetchState.calls).toHaveLength(0);
    });

    it('tracks separate IPs independently via the last X-Forwarded-For hop', async () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = '1';

      const first = await middleware(
        request('/launcher', { headers: { 'x-forwarded-for': '1.2.3.4' } }),
      );
      const second = await middleware(
        request('/launcher', { headers: { 'x-forwarded-for': '5.6.7.8' } }),
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });

    it('is bypassed entirely when SOVEREIGN_RATE_LIMIT_DISABLED is set', async () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = '1';
      process.env.SOVEREIGN_RATE_LIMIT_DISABLED = '1';

      const first = await middleware(request('/launcher'));
      const second = await middleware(request('/launcher'));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });
  });
});

describe('middleware matcher', () => {
  // The matcher is a negative-lookahead allowlist, so a path listed inside it
  // is excluded from Next's routing to `middleware()` entirely — the function
  // above is never invoked for it, regardless of what its own logic would do.
  // This is precisely why the `/api/instance` bug (see the
  // "/api/instance branding" describe block above) could not have been
  // caught by a test that calls `middleware()` directly: every test in this
  // file bypasses Next's matcher-based routing by construction, so a
  // regression at the matcher level is invisible to them. This block is the
  // only place that exercises the matcher pattern itself.
  const matches = (pathname: string) =>
    config.matcher.some((entry) => new RegExp(`^${entry}$`).test(pathname));

  it('is a single anchored allowlist pattern (the shape this suite assumes)', () => {
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher.every((entry) => entry.startsWith('/((?!'))).toBe(true);
  });

  it('matches ordinary pages and API routes so the session gate still applies', () => {
    expect(matches('/')).toBe(true);
    expect(matches('/launcher')).toBe(true);
    expect(matches('/console/plugins')).toBe(true);
    expect(matches('/api/plugins/example')).toBe(true);
  });

  // Regression: `/api/instance` was excluded from the matcher entirely
  // (like `sw.js`/`manifest.json`), so `middleware()` never ran on it —
  // including its POST/DELETE. `/api/instance/logo` and
  // `/api/instance/favicon` authorize those methods solely on a
  // `x-sovereign-user-role` header that is only trustworthy because
  // middleware strips any caller-supplied copy and re-injects it from a
  // verified session; skip the matcher and that guarantee never applies.
  // Reproduced against a live instance: an unauthenticated
  // `POST -H 'x-sovereign-user-role: platform:owner'` returned 400 "no file
  // provided" (proving the forged header reached the handler and passed),
  // not the 403 an unprivileged/missing role produces. The fix keeps the
  // path inside the matcher and carves out only public GET inside
  // `middleware()` itself (`PUBLIC_INSTANCE_GET_PATHS`).
  it.each(['/api/instance', '/api/instance/logo', '/api/instance/favicon'])(
    'does not exclude %s from the session gate (matcher must match it)',
    (pathname) => {
      expect(matches(pathname)).toBe(true);
    },
  );

  it.each(['/sw.js', '/workbox-4e0e1e1c.js', '/fallback-ce627215c0e4a9af.js', '/manifest.json'])(
    'still excludes the genuinely public static asset %s',
    (pathname) => {
      expect(matches(pathname)).toBe(false);
    },
  );

  it('does not gate the other session-free PWA and auth assets', () => {
    for (const pathname of [
      '/login',
      '/register',
      '/offline',
      '/icons/icon-192.png',
      '/favicon.ico',
      '/api/health',
    ]) {
      expect(matches(pathname)).toBe(false);
    }
  });
});
