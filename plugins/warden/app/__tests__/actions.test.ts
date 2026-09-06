import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();

class NotAuthenticatedError extends Error {
  constructor() {
    super('No authenticated session.');
    this.name = 'NotAuthenticatedError';
  }
}

vi.mock('@sovereignfs/sdk', () => ({
  sdk: { auth: { requireSession: () => requireSession() } },
  NotAuthenticatedError,
}));

const createProvider = vi.fn();
const updateProvider = vi.fn();
const deleteProvider = vi.fn();
vi.mock('../_lib/providers', () => ({
  createProvider: (...args: unknown[]) => createProvider(...args),
  updateProvider: (...args: unknown[]) => updateProvider(...args),
  deleteProvider: (...args: unknown[]) => deleteProvider(...args),
}));

const setModelVisibility = vi.fn();
const setModelVisibilityMany = vi.fn();
vi.mock('../_lib/model-visibility', () => ({
  setModelVisibility: (...args: unknown[]) => setModelVisibility(...args),
  setModelVisibilityMany: (...args: unknown[]) => setModelVisibilityMany(...args),
}));

const probeProviderModels = vi.fn();
const invalidateDiscoveryCacheForUser = vi.fn();
vi.mock('../_lib/model-discovery', () => ({
  discoverModels: vi.fn(),
  invalidateDiscoveryCacheForUser: (...args: unknown[]) => invalidateDiscoveryCacheForUser(...args),
  probeProviderModels: (...args: unknown[]) => probeProviderModels(...args),
}));

class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found.');
    this.name = 'SessionNotFoundError';
  }
}
class SessionPinLimitError extends Error {
  constructor() {
    super('You can pin up to 5 sessions — unpin one first.');
    this.name = 'SessionPinLimitError';
  }
}

const clearMessages = vi.fn();
const deleteInactiveSessions = vi.fn();
const deleteSession = vi.fn();
const pinSession = vi.fn();
const renameSession = vi.fn();
const unpinSession = vi.fn();
vi.mock('../_lib/sessions', () => ({
  clearMessages: (...args: unknown[]) => clearMessages(...args),
  deleteInactiveSessions: (...args: unknown[]) => deleteInactiveSessions(...args),
  deleteSession: (...args: unknown[]) => deleteSession(...args),
  pinSession: (...args: unknown[]) => pinSession(...args),
  renameSession: (...args: unknown[]) => renameSession(...args),
  unpinSession: (...args: unknown[]) => unpinSession(...args),
  SessionNotFoundError,
  SessionPinLimitError,
}));

const setDefaultModelKey = vi.fn();
vi.mock('../_lib/user-settings', () => ({
  setDefaultModelKey: (...args: unknown[]) => setDefaultModelKey(...args),
}));

class UnsafeProviderUrlError extends Error {}
vi.mock('../_lib/url-safety', () => ({ UnsafeProviderUrlError }));

const {
  clearSessionMessagesAction,
  createProviderAction,
  deleteInactiveSessionsAction,
  deleteProviderAction,
  deleteSessionAction,
  pinSessionAction,
  renameSessionAction,
  setDefaultModelAction,
  setModelVisibilityAction,
  setModelVisibilityBulkAction,
  unpinSessionAction,
  updateProviderAction,
} = await import('../actions');

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  probeProviderModels.mockResolvedValue({ ok: true, modelIds: ['a', 'b'] });
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant-1' } });
});

describe('createProviderAction', () => {
  it('rejects when not signed in, without ever calling createProvider', async () => {
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const result = await createProviderAction(
      null,
      formData({ label: 'X', baseUrl: 'https://x.example.com', apiKey: 'k' }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to manage Warden providers.',
    });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it.each([
    ['label', { baseUrl: 'https://x.example.com', apiKey: 'k' }, 'Give this provider a name.'],
    ['baseUrl', { label: 'X', apiKey: 'k' }, 'A base URL is required.'],
    ['apiKey', { label: 'X', baseUrl: 'https://x.example.com' }, 'An API key is required.'],
  ])('requires %s', async (_field, fields, expectedError) => {
    const result = await createProviderAction(null, formData(fields));
    expect(result).toEqual({ ok: false, error: expectedError });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('trims fields and returns a confirmation message on success', async () => {
    createProvider.mockResolvedValue({ id: 'conn-1' });
    const result = await createProviderAction(
      null,
      formData({
        label: '  OpenRouter  ',
        baseUrl: '  https://openrouter.ai/api/v1  ',
        apiKey: '  sk-1  ',
      }),
    );
    expect(createProvider).toHaveBeenCalledWith({
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-1',
    });
    expect(result).toEqual({ ok: true, message: 'OpenRouter was added — 2 models available.' });
  });

  it('refuses to save a provider whose key is rejected, keeping the form intact', async () => {
    probeProviderModels.mockResolvedValue({
      ok: false,
      authFailed: true,
      message: 'This provider rejected the API key.',
    });
    const result = await createProviderAction(
      null,
      formData({ label: 'X', baseUrl: 'https://x.example.com/v1', apiKey: 'bad' }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'This provider rejected the API key. Check the key and try again.',
    });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('saves an unreachable provider anyway, but says so as a warning', async () => {
    probeProviderModels.mockResolvedValue({
      ok: false,
      authFailed: false,
      message: 'This provider is unreachable.',
    });
    createProvider.mockResolvedValue({ id: 'conn-1' });
    const result = await createProviderAction(
      null,
      formData({ label: 'Home server', baseUrl: 'http://192.168.1.20:11434/v1', apiKey: 'none' }),
    );
    expect(createProvider).toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      tone: 'warning',
      message: 'Home server was added, but it can’t be reached right now — check the base URL.',
    });
  });

  it('surfaces an unsafe-URL rejection as the exact user-facing message', async () => {
    createProvider.mockRejectedValue(new UnsafeProviderUrlError('This base URL is not allowed.'));
    const result = await createProviderAction(
      null,
      formData({ label: 'X', baseUrl: 'http://harness:3003', apiKey: 'k' }),
    );
    expect(result).toEqual({ ok: false, error: 'This base URL is not allowed.' });
  });

  it('falls back to a generic message for an unrecognized failure', async () => {
    createProvider.mockRejectedValue(new Error('boom'));
    const result = await createProviderAction(
      null,
      formData({ label: 'X', baseUrl: 'https://x.example.com', apiKey: 'k' }),
    );
    expect(result).toEqual({ ok: false, error: 'Could not add this provider.' });
  });
});

describe('updateProviderAction', () => {
  it('is bindable to an id and leaves the API key untouched when left blank', async () => {
    updateProvider.mockResolvedValue({ label: 'Renamed' });
    const bound = updateProviderAction.bind(null, 'conn-1');
    const result = await bound(
      null,
      formData({ label: 'Renamed', baseUrl: 'https://x.example.com' }),
    );
    expect(updateProvider).toHaveBeenCalledWith('conn-1', {
      label: 'Renamed',
      baseUrl: 'https://x.example.com',
      apiKey: undefined,
    });
    expect(result).toEqual({ ok: true, message: 'Renamed was updated.' });
  });

  it.each([
    ['label', { baseUrl: 'https://x.example.com' }, 'Give this provider a name.'],
    ['baseUrl', { label: 'X' }, 'A base URL is required.'],
  ])(
    'rejects a cleared %s instead of silently keeping the old value',
    async (_field, fields, expectedError) => {
      const bound = updateProviderAction.bind(null, 'conn-1');
      const result = await bound(null, formData(fields));
      expect(result).toEqual({ ok: false, error: expectedError });
      expect(updateProvider).not.toHaveBeenCalled();
    },
  );

  it('passes a non-blank API key through unchanged', async () => {
    updateProvider.mockResolvedValue({ label: 'Renamed' });
    const bound = updateProviderAction.bind(null, 'conn-1');
    await bound(
      null,
      formData({ label: 'Renamed', baseUrl: 'https://x.example.com', apiKey: 'sk-new' }),
    );
    expect(updateProvider).toHaveBeenCalledWith('conn-1', {
      label: 'Renamed',
      baseUrl: 'https://x.example.com',
      apiKey: 'sk-new',
    });
  });

  it('surfaces "Provider not found." for a stale/foreign id', async () => {
    updateProvider.mockRejectedValue(new Error('Provider not found.'));
    const result = await updateProviderAction(
      'missing',
      null,
      formData({ label: 'X', baseUrl: 'https://x.example.com' }),
    );
    expect(result).toEqual({ ok: false, error: 'Provider not found.' });
  });
});

describe('deleteProviderAction', () => {
  it('deletes and returns a confirmation', async () => {
    const bound = deleteProviderAction.bind(null, 'conn-1');
    const result = await bound(null, new FormData());
    expect(deleteProvider).toHaveBeenCalledWith('conn-1');
    expect(result).toEqual({ ok: true, message: 'The provider was removed.' });
  });

  it('rejects when not signed in', async () => {
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const bound = deleteProviderAction.bind(null, 'conn-1');
    const result = await bound(null, new FormData());
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to manage Warden providers.',
    });
    expect(deleteProvider).not.toHaveBeenCalled();
  });
});

describe('setModelVisibilityAction', () => {
  it('hides a model, scoped to the calling user', async () => {
    const result = await setModelVisibilityAction('conn-1:gpt-4o', false);
    expect(setModelVisibility).toHaveBeenCalledWith('user-1', 'tenant-1', 'conn-1:gpt-4o', false);
    expect(result).toEqual({ ok: true, message: 'Model hidden from chat.' });
  });

  it('shows a model, scoped to the calling user', async () => {
    const result = await setModelVisibilityAction('conn-1:gpt-4o', true);
    expect(setModelVisibility).toHaveBeenCalledWith('user-1', 'tenant-1', 'conn-1:gpt-4o', true);
    expect(result).toEqual({ ok: true, message: 'Model shown in chat.' });
  });

  it('rejects when not signed in, without touching visibility', async () => {
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const result = await setModelVisibilityAction('local', true);
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to manage Warden providers.',
    });
    expect(setModelVisibility).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for an unrecognized failure', async () => {
    setModelVisibility.mockRejectedValue(new Error('db down'));
    const result = await setModelVisibilityAction('local', false);
    expect(result).toEqual({ ok: false, error: 'Could not update this model.' });
  });
});

describe('setDefaultModelAction', () => {
  it('sets the default model, scoped to the calling user', async () => {
    const result = await setDefaultModelAction('conn-1:gpt-4o');
    expect(setDefaultModelKey).toHaveBeenCalledWith('user-1', 'tenant-1', 'conn-1:gpt-4o');
    expect(result).toEqual({ ok: true, message: 'Default model updated.' });
  });

  it('clears the default when passed null', async () => {
    const result = await setDefaultModelAction(null);
    expect(setDefaultModelKey).toHaveBeenCalledWith('user-1', 'tenant-1', null);
    expect(result).toEqual({ ok: true, message: 'Default model updated.' });
  });

  it('rejects when not signed in, without touching the setting', async () => {
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const result = await setDefaultModelAction('local');
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to manage Warden providers.',
    });
    expect(setDefaultModelKey).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for an unrecognized failure', async () => {
    setDefaultModelKey.mockRejectedValue(new Error('db down'));
    const result = await setDefaultModelAction('local');
    expect(result).toEqual({ ok: false, error: 'Could not update the default model.' });
  });
});

describe('deleteInactiveSessionsAction', () => {
  it('reports how many sessions were deleted', async () => {
    deleteInactiveSessions.mockResolvedValue(3);
    const result = await deleteInactiveSessionsAction(30);
    expect(deleteInactiveSessions).toHaveBeenCalledWith('user-1', 'tenant-1', 30);
    expect(result).toEqual({ ok: true, message: 'Deleted 3 inactive sessions.' });
  });

  it('uses singular phrasing for exactly one deleted session', async () => {
    deleteInactiveSessions.mockResolvedValue(1);
    const result = await deleteInactiveSessionsAction(30);
    expect(result).toEqual({ ok: true, message: 'Deleted 1 inactive session.' });
  });

  it('reports zero deletions distinctly', async () => {
    deleteInactiveSessions.mockResolvedValue(0);
    const result = await deleteInactiveSessionsAction(30);
    expect(result).toEqual({ ok: true, message: 'No inactive sessions to delete.' });
  });

  it('rejects when not signed in, without deleting anything', async () => {
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const result = await deleteInactiveSessionsAction(30);
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to manage Warden providers.',
    });
    expect(deleteInactiveSessions).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for an unrecognized failure', async () => {
    deleteInactiveSessions.mockRejectedValue(new Error('db down'));
    const result = await deleteInactiveSessionsAction(30);
    expect(result).toEqual({ ok: false, error: 'Could not delete inactive sessions.' });
  });
});

describe('renameSessionAction', () => {
  it('renames and confirms with the new title', async () => {
    renameSession.mockResolvedValue({ id: 's1', title: 'New title' });
    const result = await renameSessionAction('s1', 'New title');
    expect(renameSession).toHaveBeenCalledWith('user-1', 'tenant-1', 's1', 'New title');
    expect(result).toEqual({ ok: true, message: 'Renamed to "New title".' });
  });

  it('confirms distinctly when the title is cleared to blank', async () => {
    renameSession.mockResolvedValue({ id: 's1', title: null });
    const result = await renameSessionAction('s1', '   ');
    expect(result).toEqual({ ok: true, message: 'Session title cleared.' });
  });

  it('surfaces "Session not found." for a stale/foreign id', async () => {
    renameSession.mockRejectedValue(new SessionNotFoundError());
    const result = await renameSessionAction('missing', 'x');
    expect(result).toEqual({ ok: false, error: 'Session not found.' });
  });

  it('rejects when not signed in', async () => {
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const result = await renameSessionAction('s1', 'x');
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to manage Warden providers.',
    });
    expect(renameSession).not.toHaveBeenCalled();
  });
});

describe('pinSessionAction', () => {
  it('pins and confirms', async () => {
    const result = await pinSessionAction('s1');
    expect(pinSession).toHaveBeenCalledWith('user-1', 'tenant-1', 's1');
    expect(result).toEqual({ ok: true, message: 'Session pinned.' });
  });

  it('surfaces the pin-limit error message, not a generic fallback', async () => {
    pinSession.mockRejectedValue(new SessionPinLimitError());
    const result = await pinSessionAction('s1');
    expect(result).toEqual({
      ok: false,
      error: 'You can pin up to 5 sessions — unpin one first.',
    });
  });

  it('rejects when not signed in', async () => {
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const result = await pinSessionAction('s1');
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to manage Warden providers.',
    });
    expect(pinSession).not.toHaveBeenCalled();
  });
});

describe('unpinSessionAction', () => {
  it('unpins and confirms', async () => {
    const result = await unpinSessionAction('s1');
    expect(unpinSession).toHaveBeenCalledWith('user-1', 'tenant-1', 's1');
    expect(result).toEqual({ ok: true, message: 'Session unpinned.' });
  });

  it('falls back to a generic message for an unrecognized failure', async () => {
    unpinSession.mockRejectedValue(new Error('db down'));
    const result = await unpinSessionAction('s1');
    expect(result).toEqual({ ok: false, error: 'Could not unpin this session.' });
  });
});

describe('deleteSessionAction', () => {
  it('deletes and confirms', async () => {
    const result = await deleteSessionAction('s1');
    expect(deleteSession).toHaveBeenCalledWith('user-1', 'tenant-1', 's1');
    expect(result).toEqual({ ok: true, message: 'Session deleted.' });
  });

  it('rejects when not signed in, without deleting anything', async () => {
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const result = await deleteSessionAction('s1');
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to manage Warden providers.',
    });
    expect(deleteSession).not.toHaveBeenCalled();
  });
});

/**
 * A `'use server'` function is a public POST endpoint dispatched by action
 * id, so `QuantityStepper`'s own min/max in `GeneralSettings` is not
 * enforcement. Unbounded, a `0` or negative threshold puts the cutoff at or
 * after "now" and deletes every unpinned session — including ones used
 * seconds ago — with no confirmation and no undo.
 */
describe('deleteInactiveSessionsAction — input validation', () => {
  it.each([0, -1, -3650, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 366])(
    'rejects %p without touching the database',
    async (value) => {
      const result = await deleteInactiveSessionsAction(value);

      expect(result.ok).toBe(false);
      expect(deleteInactiveSessions).not.toHaveBeenCalled();
    },
  );

  it.each([1, 30, 365])('accepts %p', async (value) => {
    deleteInactiveSessions.mockResolvedValue(0);

    const result = await deleteInactiveSessionsAction(value);

    expect(result.ok).toBe(true);
    expect(deleteInactiveSessions).toHaveBeenCalledWith('user-1', 'tenant-1', value);
  });
});

describe('setModelVisibilityBulkAction', () => {
  it('shows a whole group, scoped to the calling user', async () => {
    const result = await setModelVisibilityBulkAction(['conn-1:a', 'conn-1:b'], true);
    expect(setModelVisibilityMany).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      ['conn-1:a', 'conn-1:b'],
      true,
    );
    expect(result).toEqual({ ok: true, message: '2 models shown in chat.' });
  });

  it('rejects a malformed key list without touching visibility', async () => {
    expect(await setModelVisibilityBulkAction('conn-1:a', true)).toEqual({
      ok: false,
      error: 'Could not update these models.',
    });
    expect(await setModelVisibilityBulkAction([1, 2], false)).toEqual({
      ok: false,
      error: 'Could not update these models.',
    });
    expect(setModelVisibilityMany).not.toHaveBeenCalled();
  });
});

describe('clearSessionMessagesAction', () => {
  it('clears the session for the calling user', async () => {
    clearMessages.mockResolvedValue(undefined);
    const result = await clearSessionMessagesAction('s-1');
    expect(clearMessages).toHaveBeenCalledWith('user-1', 'tenant-1', 's-1');
    expect(result).toEqual({ ok: true, message: 'Conversation cleared.' });
  });

  it("surfaces a foreign session id as the session's own not-found message", async () => {
    clearMessages.mockRejectedValue(new SessionNotFoundError());
    expect(await clearSessionMessagesAction('nope')).toEqual({
      ok: false,
      error: 'Session not found.',
    });
  });
});
