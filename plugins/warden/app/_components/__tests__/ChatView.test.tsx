// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatView } from '../ChatView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sseResponse(frames: object[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status });
}

function sendMessage(text: string) {
  const input = screen.getByLabelText('Message Warden');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

const models = [
  { key: 'local', label: 'Local model (this server)' },
  { key: 'conn-1:gpt-4o-mini', label: 'OpenRouter — gpt-4o-mini' },
];

function renderChatView(overrides: Partial<Parameters<typeof ChatView>[0]> = {}) {
  return render(
    <ChatView initialMessages={[]} models={models} defaultModelKey="local" {...overrides} />,
  );
}

describe('ChatView — persisted mode (default)', () => {
  it('shows the empty state before any message is sent', () => {
    renderChatView();
    expect(screen.getByText('Ask Warden anything')).toBeDefined();
  });

  it('seeds the thread from initialMessages', () => {
    renderChatView({
      initialMessages: [
        {
          id: '1',
          role: 'user',
          content: 'earlier',
          providerId: null,
          model: 'local',
          createdAt: 1,
        },
        {
          id: '2',
          role: 'assistant',
          content: 'earlier reply',
          providerId: null,
          model: 'local',
          createdAt: 2,
        },
      ],
    });
    expect(screen.getByText('earlier')).toBeDefined();
    expect(screen.getByText('earlier reply')).toBeDefined();
  });

  it('sends {modelKey, content} — not the whole transcript — for a new message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);

    renderChatView({
      initialMessages: [
        {
          id: '1',
          role: 'user',
          content: 'earlier',
          providerId: null,
          model: 'local',
          createdAt: 1,
        },
      ],
    });
    sendMessage('new message');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ modelKey: 'local', content: 'new message' });
  });

  it('sends a message, streams the response, and appends both turns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { type: 'token', text: 'Hel' },
          { type: 'token', text: 'lo' },
          { type: 'done', completionTokens: 2 },
        ]),
      ),
    );

    renderChatView();
    sendMessage('hi there');

    expect(await screen.findByText('hi there')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Hello')).toBeDefined());
  });

  it('shows a blocking unavailable state when the very first message fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'unavailable', message: 'harness is down' }), {
          status: 503,
        }),
      ),
    );

    renderChatView();
    sendMessage('hi');

    expect(await screen.findByText('Warden is unavailable')).toBeDefined();
    expect(screen.getByText('harness is down')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('shows a non-blocking banner (not the blocking state) when a later message fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse([{ type: 'token', text: 'hi!' }, { type: 'done' }]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'error', message: 'boom' }), { status: 502 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderChatView();
    sendMessage('first');
    await waitFor(() => expect(screen.getByText('hi!')).toBeDefined());
    sendMessage('second');

    expect(await screen.findByText('boom')).toBeDefined();
    expect(screen.getByText('first')).toBeDefined();
    expect(screen.getByText('hi!')).toBeDefined();
    expect(screen.queryByText('Warden is unavailable')).toBeNull();
  });

  it('recovers from the blocking state via Try again', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: 'unavailable', message: 'down' }), { status: 503 }),
        ),
    );

    renderChatView();
    sendMessage('hi');
    await screen.findByText('Warden is unavailable');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('Warden is unavailable')).toBeNull();
    expect(screen.getByLabelText('Message Warden')).toBeDefined();
  });
});

describe('ChatView — no reachable model', () => {
  it('disables the model picker and Send when the models list is empty', () => {
    renderChatView({ models: [], defaultModelKey: '' });
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Message Warden'), { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
  });
});

describe('ChatView — incognito', () => {
  it('starts as a fresh, empty scratch context, distinct from the persisted thread', () => {
    renderChatView({
      initialMessages: [
        {
          id: '1',
          role: 'user',
          content: 'persisted message',
          providerId: null,
          model: 'local',
          createdAt: 1,
        },
      ],
    });
    expect(screen.getByText('persisted message')).toBeDefined();

    fireEvent.click(
      screen.getByRole('switch', { name: "Incognito — don't save this conversation" }),
    );

    expect(screen.queryByText('persisted message')).toBeNull();
    expect(screen.getByText('Incognito chat')).toBeDefined();
  });

  it('sends {modelKey, incognito: true, messages} instead of the persisted shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);

    renderChatView();
    fireEvent.click(
      screen.getByRole('switch', { name: "Incognito — don't save this conversation" }),
    );
    sendMessage('off the record');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      modelKey: 'local',
      incognito: true,
      messages: [{ role: 'user', content: 'off the record' }],
    });
  });

  it('discards the incognito context and restores the persisted thread when turned off', () => {
    renderChatView({
      initialMessages: [
        {
          id: '1',
          role: 'user',
          content: 'persisted message',
          providerId: null,
          model: 'local',
          createdAt: 1,
        },
      ],
    });
    const toggle = screen.getByRole('switch', { name: "Incognito — don't save this conversation" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText('persisted message')).toBeDefined();
  });

  it('starts fresh again every time it is turned back on, never resuming a prior incognito turn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }])));
    renderChatView();
    const toggle = screen.getByRole('switch', { name: "Incognito — don't save this conversation" });

    fireEvent.click(toggle); // on
    sendMessage('first incognito message');
    await screen.findByText('first incognito message');

    fireEvent.click(toggle); // off
    fireEvent.click(toggle); // on again
    expect(screen.queryByText('first incognito message')).toBeNull();
  });
});

describe('ChatView — model selection', () => {
  it('sends the selected model key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);

    renderChatView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'conn-1:gpt-4o-mini' },
    });
    sendMessage('hi');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.modelKey).toBe('conn-1:gpt-4o-mini');
  });
});
