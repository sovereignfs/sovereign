import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  updateExampleAppsAction,
  updateRootPluginAction,
  updateInstanceAction,
  uploadLogoAction,
  uploadFaviconAction,
  updateSmtpSettingsAction,
  saveProviderConfigAction,
  testProviderConfigAction,
  deleteProviderConfigAction,
  updatePushRelayAction,
  updateRetentionAction,
  testSmtpSettingsAction,
} = await import('../actions');

function okFetch(body: unknown = {}) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function fileForm(entries: Record<string, string>, file: File | null): FormData {
  const fd = formData(entries);
  if (file) fd.set('file', file);
  return fd;
}

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

/** Every test that stubs `fetch` used to unstub it by hand on its last line —
 *  a failing assertion skipped the unstub and leaked the stub into the next
 *  test. Centralised here so it runs even when an assertion throws. */
afterEach(() => {
  vi.unstubAllGlobals();
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
  });

  it('updateInviteOnlyAction refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(updateInviteOnlyAction(null, formData({ inviteOnly: 'on' }))).rejects.toThrow(
      'Insufficient privileges to change instance settings.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('updateRootPluginAction refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      updateRootPluginAction(null, formData({ rootPluginId: 'launcher' })),
    ).rejects.toThrow('Insufficient privileges to change instance settings.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('updateInstanceAction (branding) refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(updateInstanceAction(null, formData({ instanceName: 'Acme' }))).rejects.toThrow(
      'Insufficient privileges to change instance settings.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('saveProviderConfigAction refuses a session without instance:configure-secrets', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      saveProviderConfigAction(null, formData({ pluginId: 'plainwrite', provider: 'github' })),
    ).rejects.toThrow('Insufficient privileges to change instance secrets.');
    expect(fetch).not.toHaveBeenCalled();
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
  });

  it('rejects an empty tenant name without calling the admin API', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await updateTenantNameAction(null, formData({ tenantName: '   ' }));

    expect(result).toEqual({ ok: false, error: 'Instance name is required.' });
    expect(fetch).not.toHaveBeenCalled();
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
  });

  it('rejects an out-of-range port without calling the admin API', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await updateSmtpSettingsAction(
      null,
      formData({ host: 'smtp.example.test', port: '999999' }),
    );

    expect(result).toEqual({ ok: false, error: 'Port must be an integer between 1 and 65535.' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('settings actions — previously untested mutations', () => {
  it('updateExampleAppsAction refuses without instance:configure and PATCHes the flag otherwise', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      updateExampleAppsAction(null, formData({ examplesEnabled: 'on' })),
    ).rejects.toThrow('Insufficient privileges to change instance settings.');
    expect(fetch).not.toHaveBeenCalled();

    hasCapability.mockReturnValue(true);
    const fetchMock = okFetch();
    await expect(updateExampleAppsAction(null, formData({}))).resolves.toEqual({
      ok: true,
      message: 'Saved.',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/settings'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ examplesEnabled: false }),
      }),
    );
  });

  it('updateRootPluginAction requires a selection before calling the API', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(updateRootPluginAction(null, formData({}))).resolves.toEqual({
      ok: false,
      error: 'Select a plugin.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('updateInstanceAction rejects an unknown radius preset and theme preset', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(updateInstanceAction(null, formData({ instanceRadius: 'xxl' }))).resolves.toEqual({
      ok: false,
      error: 'Corner radius must be one of none, xs, s, m, l.',
    });
    await expect(
      updateInstanceAction(null, formData({ instanceThemePreset: 'vaporwave' })),
    ).resolves.toEqual({ ok: false, error: 'Theme must be one of default, neobrutalism.' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('updateInstanceAction PATCHes instance-config with blanks normalised to null', async () => {
    const fetchMock = okFetch();
    await expect(
      updateInstanceAction(null, formData({ instanceName: ' Acme ', instancePrimary: '' })),
    ).resolves.toEqual({ ok: true, message: 'Instance identity saved.' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      instanceName: 'Acme',
      instancePrimary: null,
    });
  });

  it('uploadLogoAction and uploadFaviconAction refuse without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    await expect(uploadLogoAction(null, fileForm({}, file))).rejects.toThrow(
      'Insufficient privileges to change instance settings.',
    );
    await expect(uploadFaviconAction(null, fileForm({}, file))).rejects.toThrow(
      'Insufficient privileges to change instance settings.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploadLogoAction requires a non-empty file and targets the dark variant on request', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(uploadLogoAction(null, fileForm({}, null))).resolves.toEqual({
      ok: false,
      error: 'No file selected.',
    });
    expect(fetch).not.toHaveBeenCalled();

    const fetchMock = okFetch();
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    await expect(uploadLogoAction(null, fileForm({ dark: '1' }, file))).resolves.toEqual({
      ok: true,
      message: 'Logo (dark) uploaded.',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/instance/logo?dark=1'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uploadFaviconAction uploads to the favicon endpoint', async () => {
    const fetchMock = okFetch();
    const file = new File(['ico'], 'favicon.ico', { type: 'image/x-icon' });
    await expect(uploadFaviconAction(null, fileForm({}, file))).resolves.toEqual({
      ok: true,
      message: 'Favicon uploaded.',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/instance/favicon'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('testProviderConfigAction and deleteProviderConfigAction refuse without instance:configure-secrets', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());
    await expect(testProviderConfigAction(null, formData({ id: 'pc-1' }))).rejects.toThrow(
      'Insufficient privileges to change instance secrets.',
    );
    await expect(deleteProviderConfigAction(null, formData({ id: 'pc-1' }))).rejects.toThrow(
      'Insufficient privileges to change instance secrets.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('testProviderConfigAction reports a failed test from the API body even on a 200', async () => {
    okFetch({ error: 'invalid client secret' });
    await expect(testProviderConfigAction(null, formData({ id: 'pc-1' }))).resolves.toEqual({
      ok: false,
      error: 'invalid client secret',
    });

    okFetch({});
    await expect(testProviderConfigAction(null, formData({ id: 'pc-1' }))).resolves.toEqual({
      ok: true,
      message: 'Provider config test passed.',
    });
  });

  it('deleteProviderConfigAction DELETEs the saved config', async () => {
    const fetchMock = okFetch();
    await expect(deleteProviderConfigAction(null, formData({ id: 'pc 1' }))).resolves.toEqual({
      ok: true,
      message: 'Provider config removed.',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/provider-configs/pc%201'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('updatePushRelayAction sends null for a blank URL (use the default), distinct from disabled', async () => {
    const fetchMock = okFetch();
    await updatePushRelayAction(null, formData({ pushRelayUrl: '  ', pushRelayDisabled: 'on' }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ pushRelay: { url: null, disabled: true } });
  });

  it('updateRetentionAction rejects non-positive or fractional day counts and sends null for blanks', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      updateRetentionAction(null, formData({ retentionDeliveryLogsDays: '0' })),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      updateRetentionAction(null, formData({ retentionActivityLogDays: '1.5' })),
    ).resolves.toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();

    const fetchMock = okFetch();
    await updateRetentionAction(null, formData({ retentionDeliveryLogsDays: '30' }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      retention: { deliveryLogsDays: 30, activityLogDays: null },
    });
  });

  it('testSmtpSettingsAction refuses without instance:configure-secrets and sends to the caller otherwise', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());
    await expect(testSmtpSettingsAction(null, formData({}))).resolves.toEqual({
      ok: false,
      error: 'Only the instance owner can send a test email.',
    });
    expect(fetch).not.toHaveBeenCalled();

    hasCapability.mockReturnValue(true);
    const fetchMock = okFetch({});
    await expect(testSmtpSettingsAction(null, formData({}))).resolves.toEqual({
      ok: true,
      message: 'Test email sent to admin@example.test.',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/settings/smtp-test'),
      expect.objectContaining({ body: JSON.stringify({ to: 'admin@example.test' }) }),
    );
  });
});
