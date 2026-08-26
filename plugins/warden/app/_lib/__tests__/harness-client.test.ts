import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function streamResponse(): Response {
  return new Response(new ReadableStream(), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

beforeEach(async () => {
  vi.resetModules();
  const { resetHarnessClientForTests } = await import('../harness-client');
  resetHarnessClientForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkHarnessHealth', () => {
  it('reports ready when the model status is ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', modelStatus: 'ready' })),
    );
    const { checkHarnessHealth } = await import('../harness-client');
    expect(await checkHarnessHealth()).toEqual({ kind: 'ready' });
  });

  it('reports not_ready with the model status when the model is not ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', modelStatus: 'downloading' })),
    );
    const { checkHarnessHealth } = await import('../harness-client');
    expect(await checkHarnessHealth()).toEqual({ kind: 'not_ready', modelStatus: 'downloading' });
  });

  it('reports unreachable when the fetch itself fails, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { checkHarnessHealth } = await import('../harness-client');
    expect(await checkHarnessHealth()).toEqual({ kind: 'unreachable' });
  });

  it('reports unreachable on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    const { checkHarnessHealth } = await import('../harness-client');
    expect(await checkHarnessHealth()).toEqual({ kind: 'unreachable' });
  });

  it('never requires an enrollment token — no /api/enroll call happens', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'ok', modelStatus: 'ready' }));
    vi.stubGlobal('fetch', fetchMock);
    const { checkHarnessHealth } = await import('../harness-client');
    await checkHarnessHealth();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/health');
  });
});

describe('requestHarnessChat', () => {
  it('enrolls once, then reuses the cached token across calls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ instanceId: 'a', instanceKey: 'tok-1' }))
      .mockResolvedValueOnce(streamResponse())
      .mockResolvedValueOnce(streamResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { requestHarnessChat } = await import('../harness-client');
    await requestHarnessChat([{ role: 'user', content: 'hi' }]);
    await requestHarnessChat([{ role: 'user', content: 'again' }]);

    // 1 enroll call + 2 chat calls, not 2 enroll + 2 chat.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/enroll');
    expect(fetchMock.mock.calls[1][0]).toContain('/api/chat');
    expect(fetchMock.mock.calls[2][0]).toContain('/api/chat');
  });

  it('returns unavailable when apps/harness is unreachable at enroll time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { requestHarnessChat } = await import('../harness-client');
    const result = await requestHarnessChat([{ role: 'user', content: 'hi' }]);
    expect(result.kind).toBe('unavailable');
  });

  it('returns unavailable when apps/harness enrollment is not configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'not_configured', message: 'nope' }, 503)),
    );
    const { requestHarnessChat } = await import('../harness-client');
    const result = await requestHarnessChat([{ role: 'user', content: 'hi' }]);
    expect(result).toEqual({ kind: 'unavailable', message: 'nope' });
  });

  it('re-enrolls once on a 401 and retries the chat call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ instanceId: 'a', instanceKey: 'stale-tok' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ instanceId: 'a', instanceKey: 'fresh-tok' }))
      .mockResolvedValueOnce(streamResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { requestHarnessChat } = await import('../harness-client');
    const result = await requestHarnessChat([{ role: 'user', content: 'hi' }]);
    expect(result.kind).toBe('stream');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('returns unavailable if the retried 401 fails again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ instanceId: 'a', instanceKey: 'tok' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ instanceId: 'a', instanceKey: 'tok2' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const { requestHarnessChat } = await import('../harness-client');
    const result = await requestHarnessChat([{ role: 'user', content: 'hi' }]);
    expect(result.kind).toBe('unavailable');
  });

  it('maps model_not_ready through with the modelStatus', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ instanceId: 'a', instanceKey: 'tok' }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'model_not_ready', message: 'still downloading', modelStatus: 'downloading' },
          503,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { requestHarnessChat } = await import('../harness-client');
    const result = await requestHarnessChat([{ role: 'user', content: 'hi' }]);
    expect(result).toEqual({
      kind: 'model_not_ready',
      message: 'still downloading',
      modelStatus: 'downloading',
    });
  });

  it('maps a 429 to rate_limited with retryAfterSeconds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ instanceId: 'a', instanceKey: 'tok' }))
      .mockResolvedValueOnce(
        jsonResponse({ error: 'rate_limited', message: 'slow down' }, 429, {
          'retry-after': '12',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { requestHarnessChat } = await import('../harness-client');
    const result = await requestHarnessChat([{ role: 'user', content: 'hi' }]);
    expect(result).toEqual({ kind: 'rate_limited', message: 'slow down', retryAfterSeconds: 12 });
  });

  it('falls back to a generic error for anything else', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ instanceId: 'a', instanceKey: 'tok' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'bad_request', message: 'nope' }, 400));
    vi.stubGlobal('fetch', fetchMock);

    const { requestHarnessChat } = await import('../harness-client');
    const result = await requestHarnessChat([{ role: 'user', content: 'hi' }]);
    expect(result).toEqual({ kind: 'error', message: 'nope' });
  });
});
