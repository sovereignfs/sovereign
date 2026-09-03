import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sovereignfs/db', () => ({
  DEFAULT_TENANT_ID: 'default',
  getAccountPrefs: vi.fn(async () => ({
    timezone: 'UTC',
    theme: 'system',
    sidebarPlugins: null,
    textSize: 'default',
  })),
  listUserPluginSecretRefs: vi.fn(async () => []),
  getE2eeProfile: vi.fn(async () => null),
  getE2eeRecoveryWrapper: vi.fn(async () => null),
  listE2eeDeviceEnrollments: vi.fn(async () => []),
  listUserNotifications: vi.fn(async () => []),
  listUserMessages: vi.fn(async () => ({ items: [] })),
  getUserMessage: vi.fn(async () => null),
}));
vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn(async () => ({})) }));
vi.mock('@/src/avatars', () => ({
  avatarsDir: vi.fn(() => '/tmp/avatars'),
  findAvatarFile: vi.fn(() => null),
}));

const { gatherPlatformExport } = await import('../platform');

beforeEach(() => {
  process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('gatherPlatformExport', () => {
  it('reads the profile via the cookie-based session endpoint when a cookie is given (sync export route)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { name: 'Ada', email: 'ada@example.com', image: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await gatherPlatformExport('user-1', 'better-auth.session_token=abc');

    expect(result.name).toBe('Ada');
    expect(result.email).toBe('ada@example.com');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/auth/get-session');
    expect((init.headers as Record<string, string>).cookie).toBe('better-auth.session_token=abc');
  });

  it('falls back to nulls when the cookie-based session read fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => null }));
    const result = await gatherPlatformExport('user-1', '');
    expect(result.name).toBeNull();
    expect(result.email).toBeNull();
  });

  it('reads the profile via the admin-key directory lookup when cookie is null (background worker, epic task 8.18)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'user-1', name: 'Ada', email: 'ada@example.com', image: null }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await gatherPlatformExport('user-1', null);

    expect(result.name).toBe('Ada');
    expect(result.email).toBe('ada@example.com');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/admin/directory');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-admin-key');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ mode: 'resolve', ids: ['user-1'] });
  });

  it('falls back to nulls when the directory lookup fails, rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await gatherPlatformExport('user-1', null);
    expect(result.name).toBeNull();
    expect(result.email).toBeNull();
    expect(result.image).toBeNull();
  });

  it('never calls the cookie-based session endpoint when cookie is null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    await gatherPlatformExport('user-1', null);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('/api/auth/get-session');
  });
});
