import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectionsCreate = vi.fn();
const connectionsList = vi.fn();
const connectionsGet = vi.fn();
const connectionsUpdate = vi.fn();
const connectionsDisconnect = vi.fn();
const connectionsMarkError = vi.fn();
const secretsCreate = vi.fn();
const secretsGet = vi.fn();
const secretsUpdate = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    connections: {
      create: (...args: unknown[]) => connectionsCreate(...args),
      list: (...args: unknown[]) => connectionsList(...args),
      get: (...args: unknown[]) => connectionsGet(...args),
      update: (...args: unknown[]) => connectionsUpdate(...args),
      disconnect: (...args: unknown[]) => connectionsDisconnect(...args),
      markError: (...args: unknown[]) => connectionsMarkError(...args),
    },
    secrets: {
      create: (...args: unknown[]) => secretsCreate(...args),
      get: (...args: unknown[]) => secretsGet(...args),
      update: (...args: unknown[]) => secretsUpdate(...args),
    },
  },
}));

const assertSafeProviderBaseUrl = vi.fn();
vi.mock('../url-safety', () => ({
  assertSafeProviderBaseUrl: (...args: unknown[]) => assertSafeProviderBaseUrl(...args),
  UnsafeProviderUrlError: class UnsafeProviderUrlError extends Error {},
}));

const {
  createProvider,
  deleteProvider,
  getProviderApiKey,
  listProviders,
  markProviderError,
  markProviderHealthy,
  updateProvider,
} = await import('../providers');

function connectionRef(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'conn-1',
    scope: 'user',
    provider: 'openai-compatible',
    label: 'OpenRouter',
    status: 'connected',
    secretRef: 'secret-1',
    metadata: { baseUrl: 'https://openrouter.ai/api/v1' },
    lastCheckedAt: null,
    lastUsedAt: null,
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
    disconnectedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  assertSafeProviderBaseUrl.mockImplementation(async (url: string) => new URL(url));
});

describe('listProviders', () => {
  it('maps connection refs to the plain provider view, never exposing a key', async () => {
    connectionsList.mockResolvedValue([connectionRef()]);
    const result = await listProviders();
    expect(connectionsList).toHaveBeenCalledWith({ provider: 'openai-compatible', scope: 'user' });
    expect(result).toEqual([
      {
        id: 'conn-1',
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        status: 'connected',
        lastError: null,
        lastCheckedAt: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('createProvider', () => {
  it('validates the URL, stores the key via sdk.secrets, then creates the connection with only the secretRef', async () => {
    secretsCreate.mockResolvedValue({ id: 'secret-1' });
    connectionsCreate.mockResolvedValue(connectionRef());

    await createProvider({
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-super-secret',
    });

    expect(assertSafeProviderBaseUrl).toHaveBeenCalledWith('https://openrouter.ai/api/v1');
    expect(secretsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'user', value: 'sk-super-secret' }),
    );
    const createArgs = connectionsCreate.mock.calls[0][0];
    expect(createArgs.secretRef).toBe('secret-1');
    expect(createArgs.metadata).toEqual({ baseUrl: 'https://openrouter.ai/api/v1' });
    expect(JSON.stringify(createArgs)).not.toContain('sk-super-secret');
  });

  it('propagates an unsafe URL rejection without ever touching sdk.secrets', async () => {
    class UnsafeProviderUrlError extends Error {}
    assertSafeProviderBaseUrl.mockRejectedValue(new UnsafeProviderUrlError('blocked'));

    await expect(
      createProvider({ label: 'Sneaky', baseUrl: 'http://harness:3003', apiKey: 'x' }),
    ).rejects.toThrow('blocked');
    expect(secretsCreate).not.toHaveBeenCalled();
    expect(connectionsCreate).not.toHaveBeenCalled();
  });
});

describe('updateProvider', () => {
  it('rotates the secret in place when a new key is given', async () => {
    connectionsGet.mockResolvedValue(connectionRef());
    connectionsUpdate.mockResolvedValue(connectionRef({ label: 'Renamed' }));

    await updateProvider('conn-1', { apiKey: 'new-key' });

    expect(secretsUpdate).toHaveBeenCalledWith('secret-1', 'new-key');
    expect(secretsCreate).not.toHaveBeenCalled();
  });

  it('keeps the existing key when apiKey is omitted', async () => {
    connectionsGet.mockResolvedValue(connectionRef());
    connectionsUpdate.mockResolvedValue(connectionRef());

    await updateProvider('conn-1', { label: 'New name' });

    expect(secretsUpdate).not.toHaveBeenCalled();
    expect(secretsCreate).not.toHaveBeenCalled();
    expect(connectionsUpdate).toHaveBeenCalledWith(
      'conn-1',
      expect.objectContaining({ label: 'New name', secretRef: 'secret-1' }),
    );
  });

  it('throws for a connection that is not ours (wrong provider kind)', async () => {
    connectionsGet.mockResolvedValue(connectionRef({ provider: 'some-other-kind' }));
    await expect(updateProvider('conn-1', { label: 'x' })).rejects.toThrow('Provider not found.');
  });

  it('throws when the connection does not exist', async () => {
    connectionsGet.mockResolvedValue(null);
    await expect(updateProvider('missing', { label: 'x' })).rejects.toThrow('Provider not found.');
  });
});

describe('deleteProvider', () => {
  it('disconnects the connection, which atomically removes its secret', async () => {
    connectionsGet.mockResolvedValue(connectionRef());
    await deleteProvider('conn-1');
    expect(connectionsDisconnect).toHaveBeenCalledWith('conn-1');
  });

  it('is a silent no-op for an id that is not ours or already gone', async () => {
    connectionsGet.mockResolvedValue(null);
    await deleteProvider('conn-1');
    expect(connectionsDisconnect).not.toHaveBeenCalled();
  });
});

describe('getProviderApiKey', () => {
  it('resolves the key via sdk.secrets.get using the stored ref', async () => {
    connectionsGet.mockResolvedValue(connectionRef());
    secretsGet.mockResolvedValue('sk-super-secret');
    const key = await getProviderApiKey('conn-1');
    expect(secretsGet).toHaveBeenCalledWith('secret-1');
    expect(key).toBe('sk-super-secret');
  });

  it('returns null when there is no provider or no secret ref', async () => {
    connectionsGet.mockResolvedValue(null);
    expect(await getProviderApiKey('missing')).toBeNull();
    expect(secretsGet).not.toHaveBeenCalled();
  });
});

describe('markProviderHealthy / markProviderError', () => {
  it('marks a connection healthy with a fresh timestamp', async () => {
    await markProviderHealthy('conn-1');
    expect(connectionsUpdate).toHaveBeenCalledWith(
      'conn-1',
      expect.objectContaining({ status: 'connected' }),
    );
  });

  it('marks a connection errored with a sanitized message', async () => {
    await markProviderError('conn-1', 'rejected the key', 401);
    expect(connectionsMarkError).toHaveBeenCalledWith('conn-1', {
      error: { message: 'rejected the key', status: 401 },
      status: 'error',
    });
  });
});
