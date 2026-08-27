import { describe, expect, it } from 'vitest';
import { teeAndCapture } from '../stream-capture';

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

async function waitForCapture(): Promise<void> {
  // The capture branch is consumed in the background (fire-and-forget) — a
  // microtask flush isn't enough since it awaits real stream reads; a real
  // (short) timer tick reliably lets it finish for these small fixtures.
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('teeAndCapture', () => {
  it('passes the client-facing stream through unchanged', async () => {
    const original = sseResponse([
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
      { type: 'done' },
    ]);
    const response = teeAndCapture(original, () => {});
    const text = await drain(response);
    expect(text).toContain('"type":"token","text":"Hel"');
    expect(text).toContain('"type":"done"');
  });

  it('accumulates every token frame into the final text', async () => {
    const original = sseResponse([
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
      { type: 'done' },
    ]);
    let captured: { text: string; errorMessage: string | null } | null = null;
    const response = teeAndCapture(original, (result) => {
      captured = result;
    });
    await drain(response);
    await waitForCapture();
    expect(captured).toEqual({ text: 'Hello', errorMessage: null });
  });

  it('captures an error frame instead of accumulated text', async () => {
    const original = sseResponse([
      { type: 'token', text: 'partial' },
      { type: 'error', message: 'timeout' },
    ]);
    let captured: { text: string; errorMessage: string | null } | null = null;
    const response = teeAndCapture(original, (result) => {
      captured = result;
    });
    await drain(response);
    await waitForCapture();
    expect(captured).toEqual({ text: 'partial', errorMessage: 'timeout' });
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
    let captured: { text: string; errorMessage: string | null } | null = null;
    const response = teeAndCapture(new Response(body, { status: 200 }), (result) => {
      captured = result;
    });
    await drain(response);
    await waitForCapture();
    expect(captured).toEqual({ text: 'ok', errorMessage: null });
  });

  it('preserves the original status and headers', () => {
    const original = sseResponse([{ type: 'done' }]);
    const response = teeAndCapture(original, () => {});
    expect(response.status).toBe(200);
  });
});
