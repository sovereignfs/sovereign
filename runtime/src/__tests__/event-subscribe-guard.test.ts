import type { SovereignManifest } from '@sovereignfs/manifest';
import { describe, expect, it, vi } from 'vitest';
import { guardEventSubscription, type EventSubscribeGuardDeps } from '../event-subscribe-guard';

function manifest(overrides: Partial<SovereignManifest> = {}): SovereignManifest {
  return {
    schemaVersion: 1,
    id: 'com.example.notes',
    name: 'Notes',
    version: '1.0.0',
    type: 'community',
    runtime: 'native',
    routePrefix: '/notes',
    permissions: ['events:subscribe'],
    compatibility: { minPlatformVersion: '0.0.0' },
    ...overrides,
  };
}

function deps(overrides: Partial<EventSubscribeGuardDeps> = {}): EventSubscribeGuardDeps {
  return {
    getInstalledPlugins: () => [manifest()],
    getDisabledPluginIds: async () => [],
    authorizeChannel: vi.fn(async () => true),
    ...overrides,
  };
}

function request(
  url = 'https://example.test/api/events/stream?pluginId=com.example.notes&channel=list:1',
  headers: Record<string, string> = { 'x-sovereign-user-id': 'user-1' },
): Request {
  return new Request(url, { headers });
}

describe('guardEventSubscription', () => {
  it('denies with 401 when there is no session', async () => {
    const result = await guardEventSubscription(request(undefined, {}), deps());
    expect(result).toEqual({ ok: false, status: 401, message: 'unauthenticated' });
  });

  it('denies with 400 when pluginId is missing', async () => {
    const result = await guardEventSubscription(
      request('https://example.test/api/events/stream?channel=list:1'),
      deps(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('denies with 400 when channel is missing', async () => {
    const result = await guardEventSubscription(
      request('https://example.test/api/events/stream?pluginId=com.example.notes'),
      deps(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('denies with 403 when the target plugin is not installed', async () => {
    const result = await guardEventSubscription(request(), deps({ getInstalledPlugins: () => [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.message).toMatch(/not installed/);
    }
  });

  it('denies with 403 when the target plugin lacks events:subscribe', async () => {
    const result = await guardEventSubscription(
      request(),
      deps({ getInstalledPlugins: () => [manifest({ permissions: [] })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.message).toMatch(/events:subscribe/);
    }
  });

  it('denies with 403 when the target plugin is disabled', async () => {
    const result = await guardEventSubscription(
      request(),
      deps({ getDisabledPluginIds: async () => ['com.example.notes'] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.message).toMatch(/disabled/);
    }
  });

  it('denies with 403 when channel authorization returns false', async () => {
    const result = await guardEventSubscription(
      request(),
      deps({ authorizeChannel: vi.fn(async () => false) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('passes pluginId, channel, and userId from the request to authorizeChannel', async () => {
    const authorizeChannel = vi.fn(async () => true);
    await guardEventSubscription(request(), deps({ authorizeChannel }));
    expect(authorizeChannel).toHaveBeenCalledWith(
      'com.example.notes',
      'list:1',
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('allows and returns pluginId/channel/userId when every check passes', async () => {
    const result = await guardEventSubscription(request(), deps());
    expect(result).toEqual({
      ok: true,
      pluginId: 'com.example.notes',
      channel: 'list:1',
      userId: 'user-1',
    });
  });

  it('does not call authorizeChannel when an earlier check already denied', async () => {
    const authorizeChannel = vi.fn(async () => true);
    await guardEventSubscription(
      request(),
      deps({ getDisabledPluginIds: async () => ['com.example.notes'], authorizeChannel }),
    );
    expect(authorizeChannel).not.toHaveBeenCalled();
  });
});
