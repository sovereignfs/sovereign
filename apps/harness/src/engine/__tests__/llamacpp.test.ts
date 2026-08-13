import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlamaCppEngine } from '../llamacpp';

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

async function collect(gen: AsyncGenerator<{ type: string; text?: string; message?: string }>) {
  const chunks = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LlamaCppEngine', () => {
  it('parses content deltas into token chunks and emits a done chunk', async () => {
    const body = sseStream([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'lo' } }] })}\n\n`,
      `data: ${JSON.stringify({ usage: { completion_tokens: 2 } })}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const engine = new LlamaCppEngine();
    const chunks = await collect(engine.chat([{ role: 'user', content: 'hi' }], 100));
    expect(chunks).toEqual([
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
      { type: 'done', completionTokens: 2 },
    ]);
  });

  it('drops reasoning_content deltas without surfacing them as tokens', async () => {
    const body = sseStream([
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking...' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'answer' } }] })}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const engine = new LlamaCppEngine();
    const chunks = await collect(engine.chat([{ role: 'user', content: 'hi' }], 100));
    expect(chunks.filter((c) => c.type === 'token')).toEqual([{ type: 'token', text: 'answer' }]);
  });

  it('sends chat_template_kwargs.enable_thinking: false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(sseStream([`data: [DONE]\n\n`]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const engine = new LlamaCppEngine();
    await collect(engine.chat([{ role: 'user', content: 'hi' }], 100));

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('unreachable — asserted above');
    const requestInit = call[1] as RequestInit;
    const body = JSON.parse(requestInit.body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('yields an error chunk when the engine is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const engine = new LlamaCppEngine();
    const chunks = await collect(engine.chat([{ role: 'user', content: 'hi' }], 100));
    expect(chunks).toEqual([{ type: 'error', message: 'engine_unreachable' }]);
  });

  it('yields an error chunk on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    const engine = new LlamaCppEngine();
    const chunks = await collect(engine.chat([{ role: 'user', content: 'hi' }], 100));
    expect(chunks).toEqual([{ type: 'error', message: 'engine_unreachable' }]);
  });
});
