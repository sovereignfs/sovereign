import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const requestHarnessChat = vi.fn();
const requestProviderChat = vi.fn();
const listProviders = vi.fn();
const getProviderApiKey = vi.fn();
const appendMessage = vi.fn();
const getRecentMessagesForContext = vi.fn();
const createSession = vi.fn();
const deleteSession = vi.fn();
const deleteMessage = vi.fn();
const extendMessage = vi.fn();
const replaceMessage = vi.fn();

class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found.');
    this.name = 'SessionNotFoundError';
  }
}

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

vi.mock('../../../_lib/sessions', () => ({
  appendMessage: (...args: unknown[]) => appendMessage(...args),
  getRecentMessagesForContext: (...args: unknown[]) => getRecentMessagesForContext(...args),
  createSession: (...args: unknown[]) => createSession(...args),
  deleteSession: (...args: unknown[]) => deleteSession(...args),
  deleteMessage: (...args: unknown[]) => deleteMessage(...args),
  extendMessage: (...args: unknown[]) => extendMessage(...args),
  replaceMessage: (...args: unknown[]) => replaceMessage(...args),
  SessionNotFoundError,
}));

const processAttachment = vi.fn();
vi.mock('../../../_lib/attachments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../_lib/attachments')>();
  return {
    ...actual,
    // composeDocumentContent stays real (pure, already unit-tested) —
    // only the unpdf/base64-touching processAttachment is mocked here.
    processAttachment: (...args: unknown[]) => processAttachment(...args),
  };
});

const { POST } = await import('../route');

function multipartRequest(fields: Record<string, string>, file?: File): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  if (file) formData.set('file', file);
  return new Request('http://localhost/warden/api/chat', { method: 'POST', body: formData });
}

function fakeImageFile(name = 'photo.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

function fakeDocFile(name = 'notes.txt'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'text/plain' });
}

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

function readerOf(response: Response): ReadableStreamDefaultReader<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('expected a response body');
  return reader;
}

async function waitForBackgroundPersist(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant-1' } });
  getRecentMessagesForContext.mockResolvedValue([]);
  appendMessage.mockResolvedValue(undefined);
  deleteSession.mockResolvedValue(undefined);
  deleteMessage.mockResolvedValue(undefined);
  extendMessage.mockResolvedValue(undefined);
  replaceMessage.mockResolvedValue(undefined);
  createSession.mockResolvedValue({
    id: 'session-new',
    title: null,
    pinnedAt: null,
    lastActiveAt: 0,
    createdAt: 0,
  });
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
    const res = await POST(chatRequest({ modelKey: 'local', content: 'x'.repeat(13_000) }));
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

describe('POST /warden/api/chat — session resolution', () => {
  it('creates a new session lazily when no sessionId is given, and returns it via a response header', async () => {
    requestHarnessChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));
    await drain(res);

    expect(createSession).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(res.headers.get('x-warden-session-id')).toBe('session-new');
    expect(getRecentMessagesForContext).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      'session-new',
      expect.any(Number),
    );
  });

  it('uses a given sessionId as-is, without creating a new one', async () => {
    requestHarnessChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'session-existing', content: 'hi' }),
    );
    await drain(res);

    expect(createSession).not.toHaveBeenCalled();
    expect(getRecentMessagesForContext).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      'session-existing',
      expect.any(Number),
    );
    expect(res.headers.get('x-warden-session-id')).toBe('session-existing');
  });

  it('returns 400 for a sessionId that does not belong to the caller', async () => {
    getRecentMessagesForContext.mockRejectedValue(new SessionNotFoundError());

    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'someone-elses-session', content: 'hi' }),
    );

    expect(res.status).toBe(400);
    expect(requestHarnessChat).not.toHaveBeenCalled();
  });

  it('never resolves or creates a session in incognito mode', async () => {
    requestHarnessChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    await POST(
      chatRequest({
        modelKey: 'local',
        incognito: true,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );

    expect(createSession).not.toHaveBeenCalled();
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

    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-new', {
      role: 'user',
      content: 'hello',
      providerId: null,
      model: 'local',
    });
    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-new', {
      role: 'assistant',
      content: 'Hi there',
      providerId: null,
      model: 'local',
    });
  });
});

describe('POST /warden/api/chat — client cancellation', () => {
  it('persists exactly the partial reply the user saw when they stop mid-stream', async () => {
    const encoder = new TextEncoder();
    const upstreamCancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: {"type":"token","text":"Partial "}\n\n`));
        // Never closes — the model is still generating when the user stops.
      },
      cancel: upstreamCancel,
    });
    requestHarnessChat.mockResolvedValue({
      kind: 'stream',
      response: new Response(body, { status: 200 }),
    });

    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'session-1', content: 'hello' }),
    );
    const reader = readerOf(res);
    await reader.read();
    await reader.cancel('client disconnected');

    // The provider request is actually torn down, not left generating.
    expect(upstreamCancel).toHaveBeenCalled();
    await waitForBackgroundPersist();
    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-1', {
      role: 'assistant',
      content: 'Partial ',
      providerId: null,
      model: 'local',
    });
  });

  it('cleans up the stranded user turn when the user stops before any token arrived', async () => {
    appendMessage.mockResolvedValueOnce({ id: 'msg-user' });
    const body = new ReadableStream({ start() {} });
    requestHarnessChat.mockResolvedValue({
      kind: 'stream',
      response: new Response(body, { status: 200 }),
    });

    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'session-1', content: 'hello' }),
    );
    await readerOf(res).cancel('client disconnected');
    await waitForBackgroundPersist();

    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(deleteMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-1', 'msg-user');
  });
});

describe('POST /warden/api/chat — reply modes', () => {
  const thread = [
    {
      id: 'm-user',
      role: 'user',
      content: 'explain tee()',
      providerId: null,
      model: 'local',
      createdAt: 1,
    },
    {
      id: 'm-reply',
      role: 'assistant',
      content: 'tee() splits a',
      providerId: null,
      model: 'local',
      createdAt: 2,
    },
  ];

  it('continue: replays the thread plus the continue instruction and extends the last reply in place', async () => {
    getRecentMessagesForContext.mockResolvedValue(thread);
    requestHarnessChat.mockResolvedValue(
      streamResult([{ type: 'token', text: ' stream in two.' }, { type: 'done' }]),
    );

    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'session-1', mode: 'continue' }),
    );
    await drain(res);

    const sent = requestHarnessChat.mock.calls[0][0];
    expect(sent.slice(0, 2)).toEqual([
      { role: 'user', content: 'explain tee()' },
      { role: 'assistant', content: 'tee() splits a' },
    ]);
    expect(sent[2].role).toBe('user');
    expect(sent[2].content).toContain('Continue your previous reply');
    // No new user turn, no new assistant row — the existing reply grows.
    expect(appendMessage).not.toHaveBeenCalled();
    expect(extendMessage).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      'session-1',
      'm-reply',
      ' stream in two.',
    );
  });

  it('continue: rejects when the thread does not end on a reply', async () => {
    getRecentMessagesForContext.mockResolvedValue([thread[0]]);
    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'session-1', mode: 'continue' }),
    );
    expect(res.status).toBe(400);
    expect(requestHarnessChat).not.toHaveBeenCalled();
  });

  it('regenerate: resends the thread without the last reply and overwrites it on completion', async () => {
    getRecentMessagesForContext.mockResolvedValue(thread);
    requestHarnessChat.mockResolvedValue(
      streamResult([{ type: 'token', text: 'A fresh answer.' }, { type: 'done' }]),
    );

    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'session-1', mode: 'regenerate' }),
    );
    await drain(res);

    expect(requestHarnessChat.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'explain tee()' },
    ]);
    expect(appendMessage).not.toHaveBeenCalled();
    expect(replaceMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-1', 'm-reply', {
      content: 'A fresh answer.',
      providerId: null,
      model: 'local',
    });
  });

  it('regenerate: a failed model call leaves the original reply untouched', async () => {
    getRecentMessagesForContext.mockResolvedValue(thread);
    requestHarnessChat.mockResolvedValue({ kind: 'unavailable', message: 'down' });

    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'session-1', mode: 'regenerate' }),
    );
    expect(res.status).toBe(503);
    expect(replaceMessage).not.toHaveBeenCalled();
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it('edit: removes the last user turn and its reply, then sends the new text as a normal message', async () => {
    getRecentMessagesForContext.mockResolvedValue([
      {
        id: 'm-0',
        role: 'user',
        content: 'earlier',
        providerId: null,
        model: 'local',
        createdAt: 0,
      },
      {
        id: 'm-0r',
        role: 'assistant',
        content: 'earlier reply',
        providerId: null,
        model: 'local',
        createdAt: 0,
      },
      ...thread,
    ]);
    requestHarnessChat.mockResolvedValue(
      streamResult([{ type: 'token', text: 'new reply' }, { type: 'done' }]),
    );

    const res = await POST(
      chatRequest({
        modelKey: 'local',
        sessionId: 'session-1',
        mode: 'edit',
        content: 'explain tee() briefly',
      }),
    );
    await drain(res);

    expect(deleteMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-1', 'm-reply');
    expect(deleteMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-1', 'm-user');
    expect(requestHarnessChat.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'earlier reply' },
      { role: 'user', content: 'explain tee() briefly' },
    ]);
    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-1', {
      role: 'user',
      content: 'explain tee() briefly',
      providerId: null,
      model: 'local',
    });
    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-1', {
      role: 'assistant',
      content: 'new reply',
      providerId: null,
      model: 'local',
    });
  });

  it('rejects an unknown mode, and any non-send mode without a session', async () => {
    expect(
      (await POST(chatRequest({ modelKey: 'local', sessionId: 's', mode: 'rewind' }))).status,
    ).toBe(400);
    expect((await POST(chatRequest({ modelKey: 'local', mode: 'continue' }))).status).toBe(400);
    expect(requestHarnessChat).not.toHaveBeenCalled();
  });

  it('incognito continue: appends the instruction to the client transcript, persists nothing', async () => {
    requestHarnessChat.mockResolvedValue(
      streamResult([{ type: 'token', text: 'x' }, { type: 'done' }]),
    );
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'partial' },
    ];
    const res = await POST(
      chatRequest({ modelKey: 'local', incognito: true, messages, mode: 'continue' }),
    );
    await drain(res);
    const sent = requestHarnessChat.mock.calls[0][0];
    expect(sent).toHaveLength(3);
    expect(sent[2].content).toContain('Continue your previous reply');
    expect(appendMessage).not.toHaveBeenCalled();
    expect(extendMessage).not.toHaveBeenCalled();
  });

  it('surfaces the local model hitting its output cap as a truncated frame', async () => {
    requestHarnessChat.mockResolvedValue(
      streamResult([
        { type: 'token', text: 'cut' },
        { type: 'done', completionTokens: 2048 },
      ]),
    );
    const res = await POST(chatRequest({ modelKey: 'local', content: 'hello' }));
    const reader = readerOf(res);
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    expect(text).toContain('"type":"truncated"');
    expect(text.trim().endsWith('data: {"type":"done"}')).toBe(true);
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

    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-new', {
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

describe('POST /warden/api/chat — orphaned session cleanup on a failed send', () => {
  it('deletes a lazily-created session when the model call fails, so it never shows up empty in the sidebar', async () => {
    requestHarnessChat.mockResolvedValue({ kind: 'error', message: 'boom' });

    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));

    expect(res.status).toBe(502);
    expect(createSession).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(deleteSession).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-new');
  });

  it('never deletes a client-supplied session on the same failure — it may already hold prior history', async () => {
    requestHarnessChat.mockResolvedValue({ kind: 'error', message: 'boom' });

    const res = await POST(
      chatRequest({ modelKey: 'local', sessionId: 'session-existing', content: 'hi' }),
    );

    expect(res.status).toBe(502);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('does not delete anything on a successful send', async () => {
    requestHarnessChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));
    await drain(res);

    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('a cleanup failure is logged, not thrown — the original error response still reaches the client', async () => {
    requestHarnessChat.mockResolvedValue({ kind: 'error', message: 'boom' });
    deleteSession.mockRejectedValue(new Error('db down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(chatRequest({ modelKey: 'local', content: 'hi' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(res.status).toBe(502);
    expect((await res.json()).message).toBe('boom');
    expect(consoleError).toHaveBeenCalledWith(
      '[warden] failed to clean up an orphaned session after a failed send:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});

describe('POST /warden/api/chat — file attachments', () => {
  it('rejects an image attached with the local model, before dispatching anywhere', async () => {
    processAttachment.mockResolvedValue({
      ok: true,
      attachment: { kind: 'image', filename: 'photo.png', dataUrl: 'data:image/png;base64,AQID' },
    });

    const res = await POST(
      multipartRequest({ modelKey: 'local', content: 'what is this' }, fakeImageFile()),
    );

    expect(res.status).toBe(400);
    expect(requestHarnessChat).not.toHaveBeenCalled();
    expect(requestProviderChat).not.toHaveBeenCalled();
  });

  it('sends an image to an external provider as multimodal content, persisting a placeholder', async () => {
    listProviders.mockResolvedValue([
      { id: 'conn-1', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    ]);
    getProviderApiKey.mockResolvedValue('sk-1');
    processAttachment.mockResolvedValue({
      ok: true,
      attachment: { kind: 'image', filename: 'photo.png', dataUrl: 'data:image/png;base64,AQID' },
    });
    requestProviderChat.mockResolvedValue(
      streamResult([{ type: 'token', text: 'A cat.' }, { type: 'done' }]),
    );

    const res = await POST(
      multipartRequest({ modelKey: 'conn-1:gpt-4o', content: 'what is this' }, fakeImageFile()),
    );
    await drain(res);
    await waitForBackgroundPersist();

    expect(requestProviderChat).toHaveBeenCalledWith({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-1',
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
          ],
        },
      ],
    });
    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-new', {
      role: 'user',
      content: 'what is this\n\n[Image attached: photo.png]',
      providerId: 'conn-1',
      model: 'gpt-4o',
    });
  });

  it('composes a document attachment into plain text, identical for the model and for persistence', async () => {
    listProviders.mockResolvedValue([
      { id: 'conn-1', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    ]);
    getProviderApiKey.mockResolvedValue('sk-1');
    processAttachment.mockResolvedValue({
      ok: true,
      attachment: {
        kind: 'document',
        filename: 'notes.txt',
        extractedText: 'Line one.',
        truncated: false,
      },
    });
    requestProviderChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    const res = await POST(
      multipartRequest({ modelKey: 'conn-1:gpt-4o', content: 'summarize' }, fakeDocFile()),
    );
    await drain(res);
    await waitForBackgroundPersist();

    const expectedContent = 'summarize\n\n--- Attached: notes.txt ---\nLine one.';
    expect(requestProviderChat).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [{ role: 'user', content: expectedContent }] }),
    );
    expect(appendMessage).toHaveBeenCalledWith('user-1', 'tenant-1', 'session-new', {
      role: 'user',
      content: expectedContent,
      providerId: 'conn-1',
      model: 'gpt-4o',
    });
  });

  it('a document attachment works with the local model too (no vision gating)', async () => {
    processAttachment.mockResolvedValue({
      ok: true,
      attachment: {
        kind: 'document',
        filename: 'notes.txt',
        extractedText: 'Some notes.',
        truncated: false,
      },
    });
    requestHarnessChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    const res = await POST(
      multipartRequest({ modelKey: 'local', content: 'summarize' }, fakeDocFile()),
    );

    expect(res.status).toBe(200);
    expect(requestHarnessChat).toHaveBeenCalled();
  });

  it('rejects an attachment combined with incognito', async () => {
    const formData = new FormData();
    formData.set('modelKey', 'local');
    formData.set('content', 'hi');
    formData.set('incognito', 'true');
    formData.set('file', fakeImageFile());
    const res = await POST(
      new Request('http://localhost/warden/api/chat', { method: 'POST', body: formData }),
    );

    expect(res.status).toBe(400);
    expect(requestHarnessChat).not.toHaveBeenCalled();
    expect(requestProviderChat).not.toHaveBeenCalled();
  });

  it('rejects a multipart request with no file field', async () => {
    const res = await POST(multipartRequest({ modelKey: 'local', content: 'hi' }));
    expect(res.status).toBe(400);
  });

  it("surfaces processAttachment's rejection before any provider/DB call", async () => {
    processAttachment.mockResolvedValue({ ok: false, error: 'Attachments are limited to 8 MB.' });

    const res = await POST(multipartRequest({ modelKey: 'local', content: 'hi' }, fakeImageFile()));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Attachments are limited to 8 MB.');
    expect(requestHarnessChat).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('checks MAX_INPUT_CHARS against the caption, not the composed/extracted content', async () => {
    processAttachment.mockResolvedValue({
      ok: true,
      attachment: {
        kind: 'document',
        filename: 'huge.txt',
        extractedText: 'x'.repeat(19_000), // well past MAX_INPUT_CHARS (12000) on its own
        truncated: false,
      },
    });
    requestHarnessChat.mockResolvedValue(streamResult([{ type: 'done' }]));

    const res = await POST(
      multipartRequest({ modelKey: 'local', content: 'short caption' }, fakeDocFile()),
    );

    expect(res.status).toBe(200);
  });
});
