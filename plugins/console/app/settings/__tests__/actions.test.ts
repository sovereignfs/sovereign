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

const {
  updateTenantNameAction,
  updateInviteOnlyAction,
  updateRootPluginAction,
  updateInstanceAction,
  updateSmtpSettingsAction,
  saveProviderConfigAction,
} = await import('../actions');

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@example.test' } });
  hasCapability.mockReturnValue(true);
});

/**
 * Regression coverage for a systemic authorization gap found while writing
 * this suite: every settings/branding action in this file except the SMTP
 * ones called only requireSession(), with no hasCapability check — while
 * still attaching SOVEREIGN_ADMIN_KEY on the caller's behalf. Since server
 * actions are reachable by action id independent of the Console page's
 * adminOnly gate (docs/architecture-rules.md), any authenticated non-admin
 * user could previously rename the instance, disable invite-only, or change
 * the root plugin by calling these directly. Fixed alongside this test —
 * general settings now require instance:configure; provider-config actions
 * (which carry secret values) require instance:configure-secrets, matching
 * the pre-existing SMTP precedent.
 */
describe('settings actions — admin-only behavior (regression)', () => {
  it('updateTenantNameAction refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      updateTenantNameAction(null, formData({ tenantName: 'New Name' })),
    ).rejects.toThrow('Insufficient privileges to change instance settings.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('updateInviteOnlyAction refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(updateInviteOnlyAction(null, formData({ inviteOnly: 'on' }))).rejects.toThrow(
      'Insufficient privileges to change instance settings.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('updateRootPluginAction refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      updateRootPluginAction(null, formData({ rootPluginId: 'launcher' })),
    ).rejects.toThrow('Insufficient privileges to change instance settings.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('updateInstanceAction (branding) refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(updateInstanceAction(null, formData({ instanceName: 'Acme' }))).rejects.toThrow(
      'Insufficient privileges to change instance settings.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('saveProviderConfigAction refuses a session without instance:configure-secrets', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      saveProviderConfigAction(null, formData({ pluginId: 'plainwrite', provider: 'github' })),
    ).rejects.toThrow('Insufficient privileges to change instance secrets.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('settings actions — branding and settings update behavior', () => {
  it('saves a valid tenant name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );

    const result = await updateTenantNameAction(null, formData({ tenantName: 'Acme Corp' }));

    expect(result).toEqual({ ok: true, message: 'Saved.' });
    vi.unstubAllGlobals();
  });

  it('rejects an empty tenant name without calling the admin API', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await updateTenantNameAction(null, formData({ tenantName: '   ' }));

    expect(result).toEqual({ ok: false, error: 'Instance name is required.' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects an invalid primary color for branding updates', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await updateInstanceAction(
      null,
      formData({ instanceName: 'Acme', instancePrimary: 'not-a-color' }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'Primary colour must be a 6-digit hex value, e.g. #3b82f6.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('surfaces a save failure from the admin API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'db down' }), { status: 500 })),
      ),
    );

    const result = await updateTenantNameAction(null, formData({ tenantName: 'Acme Corp' }));

    expect(result).toEqual({ ok: false, error: 'db down' });
    vi.unstubAllGlobals();
  });
});

describe('updateSmtpSettingsAction — pre-existing owner-only gate (still correct)', () => {
  it('refuses a session without instance:configure-secrets', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await updateSmtpSettingsAction(null, formData({ host: 'smtp.example.test' }));

    expect(result).toEqual({
      ok: false,
      error: 'Only the instance owner can change SMTP settings.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects an out-of-range port without calling the admin API', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await updateSmtpSettingsAction(
      null,
      formData({ host: 'smtp.example.test', port: '999999' }),
    );

    expect(result).toEqual({ ok: false, error: 'Port must be an integer between 1 and 65535.' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
