import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const requestHarnessChat = vi.fn();
const requestProviderChat = vi.fn();
const listProviders = vi.fn();
const getProviderApiKey = vi.fn();
const appendMessage = vi.fn();
const getRecentMessagesForContext = vi.fn();

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

vi.mock('../../../_lib/provider-chat', () => ({
  requestProviderChat: (...args: unknown[]) => requestProviderChat(...args),
}));

vi.mock('../../../_lib/providers', () => ({
  listProviders: (...args: unknown[]) => listProviders(...args),
  getProviderApiKey: (...args: unknown[]) => getProviderApiKey(...args),
}));

vi.mock('../../../_lib/conversations', () => ({
  appendMessage: (...args: unknown[]) => appendMessage(...args),
  getRecentMessagesForContext: (...args: unknown[]) => getRecentMessagesForContext(...args),
}));

const { POST } = await import('../route');

function chatRequest(body: unknown): Request {
  return new Request('http://localhost/warden/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function streamResult(frames: object[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const frame of frames)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      controller.close();
    },
  });
  return { kind: 'stream' as const, response: new Response(body, { status: 200 }) };
}

async function drain(response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function waitForBackgroundPersist(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant-1' } });
  getRecentMessagesForContext.mockResolvedValue([]);
  appendMessage.mockResolvedValue(undefined);
});

describe('POST /warden/api/chat — auth and validation', () => {
  it('returns 401 when there is no session', async () => {
    const { NotAuthenticatedError } = await import('@sovereignfs/sdk');
    requireSession.mockRejectedValue(new NotAuthenticatedError());
    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));
    expect(res.status).toBe(401);
    expect(requestHarnessChat).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(
      new Request('http://localhost/warden/api/chat', { method: 'POST', body: 'not json' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when modelKey is missing', async () => {
    const res = await POST(chatRequest({ content: 'hi' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is missing in persisted mode', async () => {
    const res = await POST(chatRequest({ modelKey: 'local' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty/malformed messages array in incognito mode', async () => {
    const res = await POST(chatRequest({ modelKey: 'local', incognito: true, messages: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the message exceeds the input length limit', async () => {
    const res = await POST(chatRequest({ modelKey: 'local', content: 'x'.repeat(5000) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown provider in the model selection', async () => {
    listProviders.mockResolvedValue([]);
    const res = await POST(chatRequest({ modelKey: 'conn-missing:gpt-4o', content: 'hi' }));
    expect(res.status).toBe(400);
    expect(requestProviderChat).not.toHaveBeenCalled();
  });

  it('returns 400 when the resolved provider has no stored key', async () => {
    listProviders.mockResolvedValue([
      { id: 'conn-1', label: 'X', baseUrl: 'https://x.example.com' },
    ]);
    getProviderApiKey.mockResolvedValue(null);
    const res = await POST(chatRequest({ modelKey: 'conn-1:gpt-4o', content: 'hi' }));
    expect(res.status).toBe(400);
    expect(requestProviderChat).not.toHaveBeenCalled();
  });
});

describe('POST /warden/api/chat — local routing', () => {
  it('sends recent context plus the new message to requestHarnessChat', async () => {
    getRecentMessagesForContext.mockResolvedValue([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'earlier reply' },
    ]);
    requestHarnessChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    const res = await POST(chatRequest({ modelKey: 'local', content: 'new message' }));
    await drain(res);

    expect(requestHarnessChat).toHaveBeenCalledWith(
      [
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'earlier reply' },
        { role: 'user', content: 'new message' },
      ],
      expect.any(Number),
    );
  });

  it('persists both sides of the exchange, tagged as the local model', async () => {
    requestHarnessChat.mockResolvedValue(
      streamResult([{ type: 'token', text: 'Hi there' }, { type: 'done' }]),
    );

    const res = await POST(chatRequest({ modelKey: 'local', content: 'hello' }));
    await drain(res);
    await waitForBackgroundPersist();

    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', {
      role: 'user',
      content: 'hello',
      providerId: null,
      model: 'local',
    });
    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', {
      role: 'assistant',
      content: 'Hi there',
      providerId: null,
      model: 'local',
    });
  });
});

describe('POST /warden/api/chat — external provider routing', () => {
  it('resolves the provider from modelKey and calls requestProviderChat', async () => {
    listProviders.mockResolvedValue([
      { id: 'conn-1', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    ]);
    getProviderApiKey.mockResolvedValue('sk-1');
    requestProviderChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    const res = await POST(chatRequest({ modelKey: 'conn-1:gpt-4o-mini', content: 'hi' }));
    await drain(res);

    expect(requestProviderChat).toHaveBeenCalledWith({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-1',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('persists the assistant reply tagged with the provider id and model', async () => {
    listProviders.mockResolvedValue([
      { id: 'conn-1', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    ]);
    getProviderApiKey.mockResolvedValue('sk-1');
    requestProviderChat.mockResolvedValue(
      streamResult([{ type: 'token', text: 'answer' }, { type: 'done' }]),
    );

    const res = await POST(chatRequest({ modelKey: 'conn-1:gpt-4o-mini', content: 'hi' }));
    await drain(res);
    await waitForBackgroundPersist();

    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', {
      role: 'assistant',
      content: 'answer',
      providerId: 'conn-1',
      model: 'gpt-4o-mini',
    });
  });

  it('maps auth_failed to a 503 unavailable status', async () => {
    listProviders.mockResolvedValue([
      { id: 'conn-1', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    ]);
    getProviderApiKey.mockResolvedValue('bad-key');
    requestProviderChat.mockResolvedValue({ kind: 'auth_failed', message: 'rejected' });

    const res = await POST(chatRequest({ modelKey: 'conn-1:gpt-4o-mini', content: 'hi' }));
    expect(res.status).toBe(503);
  });
});

describe('POST /warden/api/chat — incognito mode', () => {
  it('never calls appendMessage, even on a successful reply', async () => {
    requestHarnessChat.mockResolvedValue(
      streamResult([{ type: 'token', text: 'secret reply' }, { type: 'done' }]),
    );

    const res = await POST(
      chatRequest({
        modelKey: 'local',
        incognito: true,
        messages: [{ role: 'user', content: 'off the record' }],
      }),
    );
    await drain(res);
    await waitForBackgroundPersist();

    expect(appendMessage).not.toHaveBeenCalled();
    expect(getRecentMessagesForContext).not.toHaveBeenCalled();
  });

  it('sends exactly the client-supplied transcript, not server-side history', async () => {
    requestHarnessChat.mockResolvedValue(streamResult([{ type: 'done' }]));
    const transcript = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'second' },
    ];

    await POST(chatRequest({ modelKey: 'local', incognito: true, messages: transcript }));

    expect(requestHarnessChat).toHaveBeenCalledWith(transcript, expect.any(Number));
  });
});

describe('POST /warden/api/chat — error mapping', () => {
  it('maps unavailable to 503', async () => {
    requestHarnessChat.mockResolvedValue({ kind: 'unavailable', message: 'down' });
    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('unavailable');
  });

  it('maps model_not_ready to 503 with modelStatus', async () => {
    requestHarnessChat.mockResolvedValue({
      kind: 'model_not_ready',
      message: 'downloading',
      modelStatus: 'downloading',
    });
    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));
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
    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
  });

  it('maps a generic error to 502', async () => {
    requestHarnessChat.mockResolvedValue({ kind: 'error', message: 'boom' });
    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));
    expect(res.status).toBe(502);
  });
});
