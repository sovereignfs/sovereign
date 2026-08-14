// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LauncherOfflineView } from '../LauncherOfflineView';

const offlineGet = vi.fn();
const offlineSet = vi.fn();

vi.mock('@sovereignfs/sdk/offline', () => ({
  offline: {
    get: (...args: unknown[]) => offlineGet(...args),
    set: (...args: unknown[]) => offlineSet(...args),
  },
}));
vi.mock('@sovereignfs/sdk/device-client', () => ({
  isDeviceOnlyTierAvailable: () => false,
}));
vi.mock('@sovereignfs/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/ui')>();
  return { ...actual, useOfflineTileState: () => 'normal' };
});

/**
 * A plugin whose id/description reads as "monetized" for this suite's
 * purposes — the tile itself has no monetization-aware rendering (paywall
 * enforcement happens entirely server-side via middleware's route-guard
 * redirect to /paywall/<id>, already covered by
 * runtime/src/__tests__/route-guard.test.ts). What belongs to this plugin's
 * own coverage is simply that such a tile renders normally, with a working
 * link — not hidden, not broken, not specially gated client-side.
 */
const MONETIZED_PLUGIN = {
  id: 'plainwrite',
  name: 'Plainwrite',
  description: 'A git-backed content editor (paid plugin).',
  routePrefix: '/plainwrite',
  adminOnly: false,
};

function mockPluginsResponse(plugins: unknown[], directory: unknown = null) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/plugins') {
        return Promise.resolve(new Response(JSON.stringify({ plugins }), { status: 200 }));
      }
      if (url === '/api/plugins/directory') {
        return Promise.resolve(new Response(JSON.stringify({ directory }), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
}

beforeEach(() => {
  offlineGet.mockResolvedValue(null);
  offlineSet.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LauncherOfflineView — accessible plugin visibility', () => {
  it('renders non-admin plugins in the main grid and admin plugins under their own section, for an admin user', async () => {
    mockPluginsResponse([
      {
        id: 'tasks',
        name: 'Tasks',
        description: 'A to-do list.',
        routePrefix: '/tasks',
        adminOnly: false,
      },
      {
        id: 'console',
        name: 'Console',
        description: 'Admin tools.',
        routePrefix: '/console',
        adminOnly: true,
      },
    ]);

    render(<LauncherOfflineView />);

    expect(await screen.findByText('Tasks')).toBeDefined();
    expect(screen.getByText('Console')).toBeDefined();
    expect(screen.getByText('Admin')).toBeDefined();
  });

  it('renders no Admin section at all for a non-admin user (server already filtered adminOnly plugins out)', async () => {
    mockPluginsResponse([
      {
        id: 'tasks',
        name: 'Tasks',
        description: 'A to-do list.',
        routePrefix: '/tasks',
        adminOnly: false,
      },
    ]);

    render(<LauncherOfflineView />);

    expect(await screen.findByText('Tasks')).toBeDefined();
    expect(screen.queryByText('Admin')).toBeNull();
  });

  it('renders a monetized plugin tile like any other — no special client-side gating', async () => {
    mockPluginsResponse([MONETIZED_PLUGIN]);

    render(<LauncherOfflineView />);

    const link = (await screen.findByText('Plainwrite')).closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/plainwrite');
  });

  it('shows the empty state, not a crash, when no plugins are installed', async () => {
    mockPluginsResponse([]);

    render(<LauncherOfflineView />);

    expect(await screen.findByText('No apps installed yet')).toBeDefined();
  });
});
