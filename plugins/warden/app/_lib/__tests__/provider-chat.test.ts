import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const assertSafeProviderBaseUrl = vi.fn();
vi.mock('../url-safety', () => ({
  assertSafeProviderBaseUrl: (...args: unknown[]) => assertSafeProviderBaseUrl(...args),
  UnsafeProviderUrlError: class UnsafeProviderUrlError extends Error {},
}));

const { requestProviderChat } = await import('../provider-chat');
const { UnsafeProviderUrlError } = await import('../url-safety');

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

function upstreamStream(chunks: string[], done = true): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (done) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

async function drain(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('expected a response body');
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

beforeEach(() => {
  vi.clearAllMocks();
  assertSafeProviderBaseUrl.mockImplementation(async (url: string) => new URL(url));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestProviderChat', () => {
  it('normalizes an OpenAI-style SSE stream into Warden frames', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(upstreamStream([sseChunk('Hel'), sseChunk('lo')]), { status: 200 }),
        ),
    );

    const result = await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-1',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.kind).toBe('stream');
    if (result.kind !== 'stream') throw new Error('expected stream');
    const text = await drain(result.response);
    expect(text).toContain('"type":"token","text":"Hel"');
    expect(text).toContain('"type":"token","text":"lo"');
    expect(text).toContain('"type":"done"');
    expect(text).not.toContain('[DONE]');
  });

  it('sends the model, messages, and max_tokens to the right endpoint with the key as a Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(upstreamStream([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-secret',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-secret');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'gpt-4o-mini', stream: true });
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('rejects an unsafe base URL before making any network call', async () => {
    assertSafeProviderBaseUrl.mockRejectedValue(new UnsafeProviderUrlError('blocked'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestProviderChat({
      baseUrl: 'http://harness:3003',
      apiKey: 'k',
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toEqual({ kind: 'unavailable', message: 'blocked' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 401/403 to auth_failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const result = await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'bad-key',
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toEqual({ kind: 'auth_failed', message: 'This provider rejected the API key.' });
  });

  it('maps a network failure to unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toEqual({ kind: 'unavailable', message: 'This provider is unreachable.' });
  });

  it('surfaces the upstream error message for a non-2xx, non-auth response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 }),
        ),
    );
    const result = await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'nonexistent',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toEqual({ kind: 'error', message: 'model not found' });
  });
});
