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

describe('ChatView', () => {
  it('shows the empty state before any message is sent', () => {
    render(<ChatView />);
    expect(screen.getByText('Ask Warden anything')).toBeDefined();
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

    render(<ChatView />);
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

    render(<ChatView />);
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

    render(<ChatView />);

    sendMessage('first');
    await waitFor(() => expect(screen.getByText('hi!')).toBeDefined());

    sendMessage('second');

    expect(await screen.findByText('boom')).toBeDefined();
    // First conversation turns are still visible — not replaced by a blocking state.
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

    render(<ChatView />);
    sendMessage('hi');
    await screen.findByText('Warden is unavailable');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('Warden is unavailable')).toBeNull();
    expect(screen.getByLabelText('Message Warden')).toBeDefined();
  });
});
