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
vi.mock('../_lib/model-visibility', () => ({
  setModelVisibility: (...args: unknown[]) => setModelVisibility(...args),
}));

class UnsafeProviderUrlError extends Error {}
vi.mock('../_lib/url-safety', () => ({ UnsafeProviderUrlError }));

const {
  createProviderAction,
  deleteProviderAction,
  setModelVisibilityAction,
  updateProviderAction,
} = await import('../actions');

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
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
    expect(result).toEqual({ ok: true, message: 'OpenRouter was added.' });
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
  it('is bindable to an id and passes only the provided fields through', async () => {
    updateProvider.mockResolvedValue({ label: 'Renamed' });
    const bound = updateProviderAction.bind(null, 'conn-1');
    const result = await bound(null, formData({ label: 'Renamed' }));
    expect(updateProvider).toHaveBeenCalledWith('conn-1', {
      label: 'Renamed',
      baseUrl: undefined,
      apiKey: undefined,
    });
    expect(result).toEqual({ ok: true, message: 'Renamed was updated.' });
  });

  it('surfaces "Provider not found." for a stale/foreign id', async () => {
    updateProvider.mockRejectedValue(new Error('Provider not found.'));
    const result = await updateProviderAction('missing', null, formData({ label: 'X' }));
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
