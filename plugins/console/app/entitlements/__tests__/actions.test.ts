import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const hasCapability = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: () => requireSession(),
      hasCapability: (...args: unknown[]) => hasCapability(...args),
    },
  },
}));

const { saveLicenseKeyAction, deleteLicenseKeyAction, grantLicenseAction } =
  await import('../actions');

function mockFetch(status: number, body?: unknown) {
  return vi.fn(() => Promise.resolve(new Response(body ? JSON.stringify(body) : '{}', { status })));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'owner-1', email: 'owner@example.test' } });
  hasCapability.mockReturnValue(true);
});

/**
 * Each of this file's 3 exported actions inlines its own
 * hasCapability(session, 'role:assign') check independently — no shared
 * guard like groups/actions.ts's requireGroupManageCapability(). None of
 * these were previously ungated (unlike sendInviteAction/
 * listUserCapabilitiesAction/email-templates-actions.ts's gaps found
 * elsewhere in this audit) — this is pure coverage for an already-correct
 * gate, closing the risk that a future refactor silently drops or weakens
 * one of the three independent checks with nothing in CI to catch it.
 */
describe('entitlements/actions.ts — capability gating (independent per-action checks)', () => {
  it('saveLicenseKeyAction refuses a session without role:assign', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await saveLicenseKeyAction('fs.example.plugin', 'private-key');

    expect(result).toEqual({
      ok: false,
      error: 'Unauthorized — only platform owners can save license keys.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('deleteLicenseKeyAction refuses a session without role:assign', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await deleteLicenseKeyAction('fs.example.plugin');

    expect(result).toEqual({
      ok: false,
      error: 'Unauthorized — only platform owners can remove license keys.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('grantLicenseAction refuses a session without role:assign, checking the exact capability string', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await grantLicenseAction('token-1', 'user-2', 'fs.example.plugin');

    expect(result).toEqual({
      ok: false,
      error: 'Unauthorized — only platform owners can grant licenses.',
    });
    expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'role:assign');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('entitlements/actions.ts — happy paths', () => {
  it('saveLicenseKeyAction saves a key for an authorized session', async () => {
    const fetchMock = mockFetch(200);
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveLicenseKeyAction('fs.example.plugin', 'private-key', 'public-key');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/license-keys'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer') }),
        body: JSON.stringify({
          pluginId: 'fs.example.plugin',
          privateKey: 'private-key',
          publicKey: 'public-key',
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('deleteLicenseKeyAction removes a key for an authorized session', async () => {
    const fetchMock = mockFetch(200);
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteLicenseKeyAction('fs.example.plugin');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/license-keys?pluginId=fs.example.plugin'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });

  it('grantLicenseAction grants a license for an authorized session', async () => {
    const fetchMock = mockFetch(200);
    vi.stubGlobal('fetch', fetchMock);

    const result = await grantLicenseAction('token-1', 'user-2', 'fs.example.plugin');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/entitlements'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          licenseToken: 'token-1',
          targetUserId: 'user-2',
          pluginId: 'fs.example.plugin',
        }),
      }),
    );
    vi.unstubAllGlobals();
  });
});

describe('entitlements/actions.ts — non-OK response handling', () => {
  it('saveLicenseKeyAction surfaces the API error field on a non-OK response', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'malformed private key' }));

    const result = await saveLicenseKeyAction('fs.example.plugin', 'bad-key');

    expect(result).toEqual({ ok: false, error: 'malformed private key' });
    vi.unstubAllGlobals();
  });

  it('deleteLicenseKeyAction falls back to a generic API error message with no error field', async () => {
    vi.stubGlobal('fetch', mockFetch(500));

    const result = await deleteLicenseKeyAction('fs.example.plugin');

    expect(result).toEqual({ ok: false, error: 'API error 500.' });
    vi.unstubAllGlobals();
  });

  it('grantLicenseAction surfaces the API error field on a non-OK response', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'license already granted' }));

    const result = await grantLicenseAction('token-1', 'user-2', 'fs.example.plugin');

    expect(result).toEqual({ ok: false, error: 'license already granted' });
    vi.unstubAllGlobals();
  });
});

describe('entitlements/actions.ts — network failure handling (distinct from a non-OK response)', () => {
  it('saveLicenseKeyAction reports unreachable when fetch itself rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const result = await saveLicenseKeyAction('fs.example.plugin', 'private-key');

    expect(result).toEqual({ ok: false, error: 'Failed to reach the runtime API.' });
    vi.unstubAllGlobals();
  });

  it('deleteLicenseKeyAction reports unreachable when fetch itself rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const result = await deleteLicenseKeyAction('fs.example.plugin');

    expect(result).toEqual({ ok: false, error: 'Failed to reach the runtime API.' });
    vi.unstubAllGlobals();
  });

  it('grantLicenseAction reports unreachable when fetch itself rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const result = await grantLicenseAction('token-1', 'user-2', 'fs.example.plugin');

    expect(result).toEqual({ ok: false, error: 'Failed to reach the runtime API.' });
    vi.unstubAllGlobals();
  });
});
