import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const requestHarnessChat = vi.fn();

vi.mock('@sovereignfs/sdk', async () => {
  const actual = await vi.importActual<typeof import('@sovereignfs/sdk')>('@sovereignfs/sdk');
  return {
    ...actual,
    sdk: { auth: { requireSession: () => requireSession() } },
  };
});

vi.mock('../../../_lib/harness-client', () => ({
  requestHarnessChat: (...args: unknown[]) => requestHarnessChat(...args),
}));

const { POST } = await import('../route');

function chatRequest(body: unknown): Request {
  return new Request('http://localhost/warden/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('POST /warden/api/chat', () => {
  it('returns 401 when there is no session', async () => {
    const { NotAuthenticatedError } = await import('@sovereignfs/sdk');
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(401);
    expect(requestHarnessChat).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty/malformed messages array', async () => {
    const res = await POST(chatRequest({ messages: [] }));
    expect(res.status).toBe(400);
    expect(requestHarnessChat).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(
      new Request('http://localhost/warden/api/chat', { method: 'POST', body: 'not json' }),
    );
    expect(res.status).toBe(400);
  });

  it('streams the response through on success', async () => {
    const stream = new ReadableStream();
    requestHarnessChat.mockResolvedValue({
      kind: 'stream',
      response: new Response(stream, { status: 200 }),
    });
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
  });

  it('maps unavailable to 503', async () => {
    requestHarnessChat.mockResolvedValue({ kind: 'unavailable', message: 'down' });
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('unavailable');
  });

  it('maps model_not_ready to 503 with modelStatus', async () => {
    requestHarnessChat.mockResolvedValue({
      kind: 'model_not_ready',
      message: 'downloading',
      modelStatus: 'downloading',
    });
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('model_not_ready');
    expect(body.modelStatus).toBe('downloading');
  });

  it('maps rate_limited to 429 with Retry-After', async () => {
    requestHarnessChat.mockResolvedValue({
      kind: 'rate_limited',
      message: 'slow down',
      retryAfterSeconds: 7,
    });
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
  });

  it('maps a generic error to 502', async () => {
    requestHarnessChat.mockResolvedValue({ kind: 'error', message: 'boom' });
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(502);
  });
});
