import { describe, expect, it, vi } from 'vitest';
import { captureAndPersist } from '../stream-capture';
import type { CaptureResult } from '../stream-capture';

function sseResponse(frames: object[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
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

function readerOf(response: Response): ReadableStreamDefaultReader<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('expected a response body');
  return reader;
}

describe('captureAndPersist', () => {
  it('passes token frames through to the client and ends with a done frame', async () => {
    const original = sseResponse([
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
      { type: 'done' },
    ]);
    const response = captureAndPersist(original, { onComplete: () => {} });
    const text = await drain(response);
    expect(text).toContain('"type":"token","text":"Hel"');
    expect(text).toContain('"type":"token","text":"lo"');
    expect(text.trim().endsWith('data: {"type":"done"}')).toBe(true);
    // Exactly one `done` — the upstream's is dropped and re-emitted after
    // persistence, never duplicated.
    expect(text.match(/"type":"done"/g)).toHaveLength(1);
  });

  it('accumulates every token frame into the final text', async () => {
    const original = sseResponse([
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
      { type: 'done' },
    ]);
    let captured: CaptureResult | null = null;
    const response = captureAndPersist(original, {
      onComplete: (result) => {
        captured = result;
      },
    });
    await drain(response);
    expect(captured).toEqual({ text: 'Hello', errorMessage: null, cancelled: false });
  });

  it('withholds the done frame until onComplete has resolved', async () => {
    const original = sseResponse([{ type: 'token', text: 'Hi' }, { type: 'done' }]);
    let release: () => void = () => {};
    const persisted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const response = captureAndPersist(original, { onComplete: () => persisted });

    const reader = readerOf(response);
    const decoder = new TextDecoder();
    let received = '';
    // Read everything that arrives before persistence completes.
    const firstRead = await reader.read();
    received += decoder.decode(firstRead.value, { stream: true });
    expect(received).toContain('"type":"token"');
    expect(received).not.toContain('"type":"done"');

    // The next read must not settle while persistence is still pending.
    const pendingRead = reader.read();
    let settled = false;
    void pendingRead.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    release();
    const next = await pendingRead;
    received += decoder.decode(next.value, { stream: true });
    expect(received).toContain('"type":"done"');
  });

  it('captures an error frame instead of accumulated text', async () => {
    const original = sseResponse([
      { type: 'token', text: 'partial' },
      { type: 'error', message: 'timeout' },
    ]);
    let captured: CaptureResult | null = null;
    const response = captureAndPersist(original, {
      onComplete: (result) => {
        captured = result;
      },
    });
    const text = await drain(response);
    expect(captured).toEqual({ text: 'partial', errorMessage: 'timeout', cancelled: false });
    // The error frame still reaches the client, followed by the final done.
    expect(text).toContain('"type":"error"');
  });

  it('ignores malformed frame lines without losing the well-formed ones', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: {"type":"token","text":"ok"}\n\n`));
        controller.enqueue(encoder.encode(`data: not json\n\n`));
        controller.enqueue(encoder.encode(`data: {"type":"done"}\n\n`));
        controller.close();
      },
    });
    let captured: CaptureResult | null = null;
    const response = captureAndPersist(new Response(body, { status: 200 }), {
      onComplete: (result) => {
        captured = result;
      },
    });
    const text = await drain(response);
    expect(captured).toEqual({ text: 'ok', errorMessage: null, cancelled: false });
    expect(text).toContain('data: not json');
  });

  it('reassembles a frame split across two chunks', async () => {
    const encoder = new TextEncoder();
    const whole = `data: {"type":"token","text":"split"}\n\n`;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(whole.slice(0, 12)));
        controller.enqueue(encoder.encode(whole.slice(12)));
        controller.enqueue(encoder.encode(`data: {"type":"done"}\n\n`));
        controller.close();
      },
    });
    let captured: CaptureResult | null = null;
    const response = captureAndPersist(new Response(body, { status: 200 }), {
      onComplete: (result) => {
        captured = result;
      },
    });
    const text = await drain(response);
    expect(captured?.text).toBe('split');
    expect(text).toContain(whole.trim());
  });

  it('cancels the upstream and persists the partial text when the client goes away', async () => {
    const encoder = new TextEncoder();
    const upstreamCancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: {"type":"token","text":"so far"}\n\n`));
        // Never closes — a reply still generating upstream.
      },
      cancel: upstreamCancel,
    });
    let captured: CaptureResult | null = null;
    const response = captureAndPersist(new Response(body, { status: 200 }), {
      onComplete: (result) => {
        captured = result;
      },
    });

    const reader = readerOf(response);
    await reader.read();
    await reader.cancel('client disconnected');

    expect(upstreamCancel).toHaveBeenCalled();
    expect(captured).toEqual({ text: 'so far', errorMessage: null, cancelled: true });
  });

  it('preserves the original status and headers', () => {
    const original = sseResponse([{ type: 'done' }]);
    const response = captureAndPersist(original, { onComplete: () => {} });
    expect(response.status).toBe(200);
  });
  it('emits a truncated frame when the done frame reports the output cap was hit', async () => {
    const original = sseResponse([
      { type: 'token', text: 'cut off' },
      { type: 'done', completionTokens: 100 },
    ]);
    const response = captureAndPersist(original, { onComplete: () => {}, outputTokenCap: 100 });
    const text = await drain(response);
    expect(text).toContain('"type":"truncated"');
    expect(text.indexOf('"type":"truncated"')).toBeLessThan(text.indexOf('"type":"done"'));
  });

  it('emits no truncated frame below the cap, or when no cap is given', async () => {
    const under = captureAndPersist(
      sseResponse([
        { type: 'token', text: 'ok' },
        { type: 'done', completionTokens: 5 },
      ]),
      { onComplete: () => {}, outputTokenCap: 100 },
    );
    expect(await drain(under)).not.toContain('"type":"truncated"');
    const uncapped = captureAndPersist(
      sseResponse([
        { type: 'token', text: 'ok' },
        { type: 'done', completionTokens: 100 },
      ]),
      { onComplete: () => {} },
    );
    expect(await drain(uncapped)).not.toContain('"type":"truncated"');
  });
});
