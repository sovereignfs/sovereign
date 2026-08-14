import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const changePassword = vi.fn();
const activityLog = vi.fn();
const cookieStore = new Map<string, string>();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'better-auth.session_token=abc' })),
  cookies: () =>
    Promise.resolve({
      set: (name: string, value: string) => {
        cookieStore.set(name, value);
      },
    }),
}));
vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: () => requireSession(),
      changePassword: (...args: unknown[]) => changePassword(...args),
    },
    activity: { log: (...args: unknown[]) => activityLog(...args) },
  },
}));

const { updateDisplayNameAction, changePasswordAction, updateSidebarPluginsAction } =
  await import('../actions');

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.clear();
  requireSession.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('updateDisplayNameAction', () => {
  it('rejects an empty name without calling the auth server', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await updateDisplayNameAction(null, formData({ name: '  ' }));

    expect(result).toEqual({ ok: false, error: 'Display name is required.' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects a name over 100 characters without calling the auth server', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await updateDisplayNameAction(null, formData({ name: 'a'.repeat(101) }));

    expect(result).toEqual({ ok: false, error: 'Display name must be 100 characters or fewer.' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('saves a valid name, clears the session cache cookies, and logs activity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );

    const result = await updateDisplayNameAction(null, formData({ name: 'New Name' }));

    expect(result).toEqual({ ok: true, message: 'Name saved.' });
    expect(cookieStore.get('better-auth.session_data')).toBe('');
    expect(cookieStore.get('__Secure-better-auth.session_data')).toBe('');
    expect(activityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'account.display_name_changed' }),
    );
    vi.unstubAllGlobals();
  });

  it('surfaces the auth server status on failure, without clearing session cookies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
    );

    const result = await updateDisplayNameAction(null, formData({ name: 'New Name' }));

    expect(result).toEqual({ ok: false, error: 'Failed to update display name: 500' });
    expect(cookieStore.has('better-auth.session_data')).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('changePasswordAction — validation path', () => {
  it('rejects a new password shorter than the minimum without calling changePassword', async () => {
    const result = await changePasswordAction(
      null,
      formData({ currentPassword: 'old', newPassword: 'short', confirmPassword: 'short' }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'New password must be at least 8 characters.',
    });
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('rejects a mismatched confirmation without calling changePassword', async () => {
    const result = await changePasswordAction(
      null,
      formData({
        currentPassword: 'old',
        newPassword: 'a-long-enough-password',
        confirmPassword: 'a-different-one',
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'New password and confirmation do not match.',
    });
    expect(changePassword).not.toHaveBeenCalled();
  });
});

describe('changePasswordAction — action path', () => {
  it('calls sdk.auth.changePassword with the current and new password on valid input', async () => {
    changePassword.mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );

    const result = await changePasswordAction(
      null,
      formData({
        currentPassword: 'old-password',
        newPassword: 'a-long-enough-password',
        confirmPassword: 'a-long-enough-password',
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-password',
      newPassword: 'a-long-enough-password',
    });
    vi.unstubAllGlobals();
  });

  it('surfaces the error message when better-auth rejects the current password', async () => {
    changePassword.mockRejectedValue(new Error('Incorrect password.'));

    const result = await changePasswordAction(
      null,
      formData({
        currentPassword: 'wrong',
        newPassword: 'a-long-enough-password',
        confirmPassword: 'a-long-enough-password',
      }),
    );

    expect(result).toEqual({ ok: false, error: 'Incorrect password.' });
  });
});

describe('updateSidebarPluginsAction — save behavior', () => {
  it('PATCHes the sidebar_plugins preference with the given entries', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await updateSidebarPluginsAction([{ id: 'tasks', hidden: false }]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/account/prefs'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ sidebar_plugins: [{ id: 'tasks', hidden: false }] }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('propagates a save failure rather than silently succeeding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'db down' }), { status: 500 })),
      ),
    );

    await expect(updateSidebarPluginsAction(null)).rejects.toThrow('db down');
    vi.unstubAllGlobals();
  });
});
