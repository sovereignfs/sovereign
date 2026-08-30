import { beforeEach, describe, expect, it, vi } from 'vitest';

const assertSafeProviderBaseUrl = vi.fn();
vi.mock('../url-safety', () => ({
  assertSafeProviderBaseUrl: (...args: unknown[]) => assertSafeProviderBaseUrl(...args),
  UnsafeProviderUrlError: class UnsafeProviderUrlError extends Error {},
}));

const pinnedFetch = vi.fn();
vi.mock('../pinned-fetch', () => ({
  pinnedFetch: (...args: unknown[]) => pinnedFetch(...args),
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
  assertSafeProviderBaseUrl.mockImplementation(async (url: string) => ({
    url: new URL(url),
    pinnedAddress: '203.0.113.10',
    pinnedFamily: 4,
  }));
});

describe('requestProviderChat', () => {
  it('normalizes an OpenAI-style SSE stream into Warden frames', async () => {
    pinnedFetch.mockResolvedValue(
      new Response(upstreamStream([sseChunk('Hel'), sseChunk('lo')]), { status: 200 }),
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

  it('sends the model, messages, and max_tokens to the right endpoint with the key as a Bearer token, pinned to the validated address', async () => {
    pinnedFetch.mockResolvedValue(new Response(upstreamStream([]), { status: 200 }));

    await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-secret',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const [url, pinnedAddress, pinnedFamily, init] = pinnedFetch.mock.calls[0];
    expect((url as URL).toString()).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(pinnedAddress).toBe('203.0.113.10');
    expect(pinnedFamily).toBe(4);
    expect(init.headers.authorization).toBe('Bearer sk-secret');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'gpt-4o-mini', stream: true });
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('rejects an unsafe base URL before making any network call', async () => {
    assertSafeProviderBaseUrl.mockRejectedValue(new UnsafeProviderUrlError('blocked'));

    const result = await requestProviderChat({
      baseUrl: 'http://harness:3003',
      apiKey: 'k',
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toEqual({ kind: 'unavailable', message: 'blocked' });
    expect(pinnedFetch).not.toHaveBeenCalled();
  });

  it('maps a 401/403 to auth_failed', async () => {
    pinnedFetch.mockResolvedValue(new Response('{}', { status: 401 }));
    const result = await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'bad-key',
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toEqual({ kind: 'auth_failed', message: 'This provider rejected the API key.' });
  });

  it('maps a network failure to unavailable', async () => {
    pinnedFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toEqual({ kind: 'unavailable', message: 'This provider is unreachable.' });
  });

  it('serializes multimodal (array-shaped) content through to the request body unchanged', async () => {
    pinnedFetch.mockResolvedValue(new Response(upstreamStream([]), { status: 200 }));

    const imageContent = [
      { type: 'text', text: 'what is this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
    ];
    await requestProviderChat({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-1',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: imageContent }],
    });

    const [, , , init] = pinnedFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.messages[0].content).toEqual(imageContent);
  });

  it('surfaces the upstream error message for a non-2xx, non-auth response', async () => {
    pinnedFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 }),
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
