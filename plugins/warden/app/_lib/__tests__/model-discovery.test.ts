import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkHarnessHealth = vi.fn();
vi.mock('../harness-client', () => ({
  checkHarnessHealth: (...args: unknown[]) => checkHarnessHealth(...args),
}));

const listProviders = vi.fn();
const getProviderApiKey = vi.fn();
const markProviderHealthy = vi.fn();
const markProviderError = vi.fn();
vi.mock('../providers', () => ({
  listProviders: (...args: unknown[]) => listProviders(...args),
  getProviderApiKey: (...args: unknown[]) => getProviderApiKey(...args),
  markProviderHealthy: (...args: unknown[]) => markProviderHealthy(...args),
  markProviderError: (...args: unknown[]) => markProviderError(...args),
}));

const assertSafeProviderBaseUrl = vi.fn();
vi.mock('../url-safety', () => ({
  assertSafeProviderBaseUrl: (...args: unknown[]) => assertSafeProviderBaseUrl(...args),
  UnsafeProviderUrlError: class UnsafeProviderUrlError extends Error {},
}));

const { discoverModels } = await import('../model-discovery');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const provider = {
  id: 'conn-1',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  status: 'connected' as const,
  lastError: null,
  lastCheckedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  assertSafeProviderBaseUrl.mockImplementation(async (url: string) => new URL(url));
  getProviderApiKey.mockResolvedValue('sk-test');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discoverModels', () => {
  it('folds in the local model only when apps/harness reports ready', async () => {
    checkHarnessHealth.mockResolvedValue({ kind: 'ready' });
    listProviders.mockResolvedValue([]);

    const result = await discoverModels();
    expect(result.local.available).toBe(true);
    expect(result.models).toEqual([{ key: 'local', label: 'Local model (this server)' }]);
  });

  it('is silently absent (not an error) when the local engine is unreachable', async () => {
    checkHarnessHealth.mockResolvedValue({ kind: 'unreachable' });
    listProviders.mockResolvedValue([]);

    const result = await discoverModels();
    expect(result.local).toEqual({ available: false, message: null });
    expect(result.models).toEqual([]);
  });

  it('surfaces a message when the local model exists but is still downloading', async () => {
    checkHarnessHealth.mockResolvedValue({ kind: 'not_ready', modelStatus: 'downloading' });
    listProviders.mockResolvedValue([]);

    const result = await discoverModels();
    expect(result.local.available).toBe(false);
    expect(result.local.message).toMatch(/downloading/);
  });

  it("lists a healthy provider's models and marks it healthy", async () => {
    checkHarnessHealth.mockResolvedValue({ kind: 'unreachable' });
    listProviders.mockResolvedValue([provider]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] })),
    );

    const result = await discoverModels();
    expect(result.providers).toEqual([
      {
        id: 'conn-1',
        label: 'OpenRouter',
        baseUrl: provider.baseUrl,
        ok: true,
        message: null,
        modelCount: 2,
      },
    ]);
    expect(result.models).toEqual([
      { key: 'conn-1:gpt-4o-mini', label: 'OpenRouter — gpt-4o-mini' },
      { key: 'conn-1:gpt-4o', label: 'OpenRouter — gpt-4o' },
    ]);
    expect(markProviderHealthy).toHaveBeenCalledWith('conn-1');
    expect(markProviderError).not.toHaveBeenCalled();
  });

  it('degrades only the failing provider — one bad provider does not break the whole list', async () => {
    checkHarnessHealth.mockResolvedValue({ kind: 'ready' });
    const good = { ...provider, id: 'conn-good' };
    const bad = { ...provider, id: 'conn-bad', baseUrl: 'https://bad.example.com' };
    listProviders.mockResolvedValue([good, bad]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' && parsed.hostname === 'bad.example.com') {
          throw new Error('ECONNREFUSED');
        }
        return jsonResponse({ data: [{ id: 'model-a' }] });
      }),
    );

    const result = await discoverModels();
    expect(result.local.available).toBe(true);
    const goodStatus = result.providers.find((p) => p.id === 'conn-good');
    const badStatus = result.providers.find((p) => p.id === 'conn-bad');
    expect(goodStatus?.ok).toBe(true);
    expect(badStatus).toEqual({
      id: 'conn-bad',
      label: 'OpenRouter',
      baseUrl: 'https://bad.example.com',
      ok: false,
      message: 'This provider is unreachable.',
      modelCount: 0,
    });
    // local + the good provider's one model, despite the bad provider failing.
    expect(result.models).toEqual([
      { key: 'local', label: 'Local model (this server)' },
      { key: 'conn-good:model-a', label: 'OpenRouter — model-a' },
    ]);
  });

  it('marks a 401/403 response as an auth failure', async () => {
    checkHarnessHealth.mockResolvedValue({ kind: 'unreachable' });
    listProviders.mockResolvedValue([provider]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401)));

    const result = await discoverModels();
    expect(result.providers[0]).toMatchObject({
      ok: false,
      message: 'This provider rejected the API key.',
    });
    expect(markProviderError).toHaveBeenCalledWith(
      'conn-1',
      'This provider rejected the API key.',
      401,
    );
  });

  it('marks a provider with no stored key as errored without making a network call', async () => {
    checkHarnessHealth.mockResolvedValue({ kind: 'unreachable' });
    listProviders.mockResolvedValue([provider]);
    getProviderApiKey.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await discoverModels();
    expect(result.providers[0]).toMatchObject({ ok: false, message: 'Missing API key.' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(markProviderError).toHaveBeenCalledWith(
      'conn-1',
      'This provider has no stored API key.',
    );
  });

  it('treats a non-array/malformed model list as zero models, not a failure', async () => {
    checkHarnessHealth.mockResolvedValue({ kind: 'unreachable' });
    listProviders.mockResolvedValue([provider]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));

    const result = await discoverModels();
    expect(result.providers[0]).toMatchObject({ ok: true, modelCount: 0 });
    expect(result.models).toEqual([]);
  });
});
