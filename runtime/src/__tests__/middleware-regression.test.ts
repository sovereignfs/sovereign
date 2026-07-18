import type { SovereignManifest } from '@sovereignfs/manifest';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@/src/registry', () => ({
  getInstalledPlugins: () => mockState.installedPlugins,
}));

vi.mock('@/src/route-guard', async () => import('../route-guard'));

vi.mock('@/src/security', async () => import('../security'));

vi.mock('@/src/session-verify', async () => import('../session-verify'));

const { middleware } = await import('../../middleware');

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

function session(role: string = 'platform:owner'): VerifiedSession {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.test',
      name: 'Test User',
      image: null,
      role,
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed by redirecting unauthenticated POST requests to /login with 303', async () => {
    fetchState.session = null;

    const response = await middleware(request('/launcher/settings', { method: 'POST' }));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://runtime.test/login');
    expect(fetchState.calls).toContain('http://localhost:3001/api/verify');
  });

  it('returns 403 for non-admin Console access', async () => {
    fetchState.session = session('platform:user');

    const response = await middleware(request('/console/users'));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('Forbidden');
  });

  it('returns 404 for disabled plugin routes', async () => {
    fetchState.disabledIds = [launcherPlugin.id];

    const response = await middleware(request('/launcher'));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
  });

  it('returns 404 for access-policy-restricted plugin routes (RFC 0065)', async () => {
    fetchState.restrictedIds = [launcherPlugin.id];

    const response = await middleware(request('/launcher'));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
  });

  it('access-policy restriction returns 404, not 403, even for an adminOnly plugin', async () => {
    fetchState.restrictedIds = [consolePlugin.id];
    fetchState.session = session('platform:admin');

    const response = await middleware(request('/console'));

    expect(response.status).toBe(404);
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
});
