// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ChatView } from '../ChatView';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
});

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

/** Opens the model-picker popover — its trigger's accessible name is
 *  whichever model (or placeholder) is currently selected. */
function openModelPicker(currentTriggerLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: currentTriggerLabel }));
}

function selectModelFromPicker(displayName: string) {
  const dialog = screen.getByRole('dialog', { name: 'Model' });
  fireEvent.click(within(dialog).getByRole('option', { name: displayName }));
}

const models = [
  { key: 'local', label: 'Local model (this server)' },
  { key: 'conn-1:gpt-4o-mini', label: 'OpenRouter — gpt-4o-mini' },
];

const providers = [{ id: 'conn-1', label: 'OpenRouter' }];

function renderChatView(overrides: Partial<Parameters<typeof ChatView>[0]> = {}) {
  return render(
    <ChatView
      initialSessionId={null}
      initialMessages={[]}
      models={models}
      providers={providers}
      defaultModelKey="local"
      {...overrides}
    />,
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

  it('sends {modelKey, sessionId, content} — not the whole transcript — for a new message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);

    renderChatView({
      initialSessionId: 'session-1',
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
    expect(body).toEqual({ modelKey: 'local', sessionId: 'session-1', content: 'new message' });
  });

  it('sends sessionId: null for a brand-new session, then adopts the id the server returns', async () => {
    // A fresh Response per call — a stream body can only be read once, and
    // this test sends two messages.
    const fetchMock = vi.fn().mockImplementation(() => {
      const response = sseResponse([{ type: 'done' }]);
      response.headers.set('x-warden-session-id', 'session-new');
      return Promise.resolve(response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderChatView();
    sendMessage('first message');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      modelKey: 'local',
      sessionId: null,
      content: 'first message',
    });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/warden?session=session-new'));

    sendMessage('second message');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      modelKey: 'local',
      sessionId: 'session-new',
      content: 'second message',
    });
    // The session id didn't change on the second send — no redundant
    // history entry for what the user experiences as the same conversation.
    expect(replace).toHaveBeenCalledTimes(1);
    // The sidebar lives in the route-group layout, which is not re-run for a
    // navigation inside it — so a brand-new session only reaches the list
    // via an explicit refresh, and only on the send that created it.
    expect(refresh).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole('button', { name: 'No model reachable' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.change(screen.getByLabelText('Message Warden'), { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
  });

  it('shows "No model reachable" when nothing was discovered at all', () => {
    renderChatView({ models: [], defaultModelKey: '' });
    expect(screen.getByText('No model reachable')).toBeDefined();
  });
});

describe('ChatView — every model hidden by the user', () => {
  it('shows a distinct message from "unreachable", pointing at Manage models', () => {
    renderChatView({ models: [], defaultModelKey: '', allModelsHidden: true });
    expect(screen.getByText('Turn on a model to get started')).toBeDefined();
    expect(screen.getAllByText('No models shown').length).toBeGreaterThan(0);
    expect(screen.queryByText('No model reachable')).toBeNull();
    // Only the empty-state's own action link — the old chat-header
    // "Manage models" link is gone (task 22.11); the model picker's own
    // footer link isn't in the DOM until its popover is opened.
    expect(screen.getAllByRole('link', { name: 'Manage models' }).length).toBe(1);
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
      screen.getByRole('button', { name: "Incognito — don't save this conversation" }),
    );

    expect(screen.queryByText('persisted message')).toBeNull();
    expect(screen.getByText('Incognito chat')).toBeDefined();
  });

  it('sends {modelKey, incognito: true, messages} instead of the persisted shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);

    renderChatView();
    fireEvent.click(
      screen.getByRole('button', { name: "Incognito — don't save this conversation" }),
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
    const toggle = screen.getByRole('button', {
      name: "Incognito — don't save this conversation",
    });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText('persisted message')).toBeDefined();
  });

  it('starts fresh again every time it is turned back on, never resuming a prior incognito turn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }])));
    renderChatView();
    const toggle = screen.getByRole('button', {
      name: "Incognito — don't save this conversation",
    });

    fireEvent.click(toggle); // on
    sendMessage('first incognito message');
    await screen.findByText('first incognito message');

    fireEvent.click(toggle); // off
    fireEvent.click(toggle); // on again
    expect(screen.queryByText('first incognito message')).toBeNull();
  });

  it('reflects its pressed state via aria-pressed', () => {
    renderChatView();
    const toggle = screen.getByRole('button', {
      name: "Incognito — don't save this conversation",
    });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('ChatView — attachments', () => {
  function fileInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error('expected a file input');
    return input as HTMLInputElement;
  }

  function selectFile(container: HTMLElement, file: File) {
    fireEvent.change(fileInput(container), { target: { files: [file] } });
  }

  it('attach button is disabled with an explanatory title when Incognito is on', () => {
    renderChatView();
    const attachButton = screen.getByRole('button', { name: 'Attach a file' });
    expect(attachButton).toHaveProperty('disabled', false);

    fireEvent.click(
      screen.getByRole('button', { name: "Incognito — don't save this conversation" }),
    );

    expect(attachButton).toHaveProperty('disabled', true);
    expect(attachButton.title).toBe('Attachments are not available in incognito mode');
  });

  it('rejects an oversized file with a visible error, no chip added', () => {
    const { container } = renderChatView();
    const oversized = new File([new Uint8Array(9 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });

    selectFile(container, oversized);

    expect(screen.getByText('Attachments are limited to 8 MB.')).toBeDefined();
    expect(screen.queryByText('big.png')).toBeNull();
  });

  it('rejects an unsupported file type', () => {
    const { container } = renderChatView();
    const zip = new File([new Uint8Array([1])], 'archive.zip', { type: 'application/zip' });

    selectFile(container, zip);

    expect(
      screen.getByText('That file type isn’t supported. Try an image, a PDF, or a text file.'),
    ).toBeDefined();
  });

  it('rejects an image while the local model is selected, without attempting a fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderChatView({ defaultModelKey: 'local' });
    const image = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' });

    selectFile(container, image);

    expect(
      screen.getByText(
        'The local model is text-only and doesn’t support images. Choose a different model first.',
      ),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders an attachment chip for a valid file, removable via its own button', () => {
    const { container } = renderChatView({ defaultModelKey: 'conn-1:gpt-4o-mini' });
    const image = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' });

    selectFile(container, image);
    expect(screen.getByText('photo.png')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));
    expect(screen.queryByText('photo.png')).toBeNull();
    expect(fileInput(container).value).toBe('');
  });

  it('sends an attachment as FormData, not JSON, with no explicit content-type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderChatView({ defaultModelKey: 'conn-1:gpt-4o-mini' });
    const image = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' });

    selectFile(container, image);
    sendMessage('what is this');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
    expect(init.body.get('modelKey')).toBe('conn-1:gpt-4o-mini');
    expect(init.body.get('content')).toBe('what is this');
    expect(init.body.get('file')).toBe(image);
  });

  /**
   * The attach control is disabled while incognito is on, but that only
   * stops a *new* attachment being started — one staged beforehand used to
   * survive the toggle, and any request carrying a file goes down the
   * multipart branch, which is the persisted one. The result was the
   * message and the full extracted document text being written to the
   * database while the UI promised nothing was saved.
   */
  it('discards a staged attachment when incognito is switched on', () => {
    const { container } = renderChatView({ defaultModelKey: 'conn-1:gpt-4o-mini' });
    const pdf = new File([new Uint8Array([1])], 'secret.pdf', { type: 'application/pdf' });

    selectFile(container, pdf);
    expect(screen.getByText('secret.pdf')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Incognito/ }));

    expect(screen.queryByText('secret.pdf')).toBeNull();
    expect(fileInput(container).value).toBe('');
  });

  it('never sends a persisted multipart request while incognito is on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderChatView({ defaultModelKey: 'conn-1:gpt-4o-mini' });

    selectFile(
      container,
      new File([new Uint8Array([1])], 'secret.pdf', { type: 'application/pdf' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Incognito/ }));
    sendMessage('summarise this');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    // JSON incognito shape, not FormData — nothing to persist.
    expect(init.body).not.toBeInstanceOf(FormData);
    expect(JSON.parse(init.body).incognito).toBe(true);
  });

  it('does not send an incognito field on an ordinary attachment send', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderChatView({ defaultModelKey: 'conn-1:gpt-4o-mini' });

    selectFile(container, new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' }));
    sendMessage('what is this');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    // The route tests this field for truthiness, so a literal 'false'
    // would reject every ordinary attachment send.
    expect(init.body.get('incognito')).toBeNull();
  });

  it('clears the attachment chip after sending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }])));
    const { container } = renderChatView({ defaultModelKey: 'conn-1:gpt-4o-mini' });
    const image = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' });

    selectFile(container, image);
    sendMessage('what is this');

    await waitFor(() => expect(screen.queryByText('photo.png')).toBeNull());
  });

  it('Send stays disabled when an attachment is present but the textarea is empty', () => {
    const { container } = renderChatView({ defaultModelKey: 'conn-1:gpt-4o-mini' });
    const image = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' });

    selectFile(container, image);

    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
  });
});

describe('ChatView — model selection', () => {
  it('sends the selected model key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }]));
    vi.stubGlobal('fetch', fetchMock);

    renderChatView();
    openModelPicker('Local model (this server)');
    selectModelFromPicker('gpt-4o-mini');
    sendMessage('hi');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.modelKey).toBe('conn-1:gpt-4o-mini');
  });

  it('groups models by provider, with the local model under its own group', () => {
    renderChatView();
    openModelPicker('Local model (this server)');
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(within(dialog).getByText('Local model')).toBeDefined();
    expect(within(dialog).getByText('OpenRouter')).toBeDefined();
    expect(within(dialog).getByRole('option', { name: 'gpt-4o-mini' })).toBeDefined();
  });
});

describe('ChatView — composer redesign (task 22.11)', () => {
  it('does not render the old chat-header links or the web-search toggle anywhere in the DOM', () => {
    renderChatView();
    expect(screen.queryByRole('link', { name: 'Manage providers' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Web search (coming soon)' })).toBeNull();
    expect(screen.queryByText('Web search')).toBeNull();
  });

  it("model picker popover's footer links to Providers and Models", () => {
    renderChatView();
    openModelPicker('Local model (this server)');
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(
      within(dialog).getByRole('link', { name: 'Manage providers' }).getAttribute('href'),
    ).toBe('/warden/providers');
    expect(within(dialog).getByRole('link', { name: 'Manage models' }).getAttribute('href')).toBe(
      '/warden/models',
    );
  });

  it('centers the composer for an empty session and docks it once the first message is sent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([{ type: 'done' }])));
    const { container } = renderChatView();

    expect(container.querySelector('.chatCentered')).not.toBeNull();
    const incognitoToggle = screen.getByRole('button', {
      name: "Incognito — don't save this conversation",
    });

    sendMessage('hello');

    await waitFor(() => expect(container.querySelector('.chatCentered')).toBeNull());
    // The composer (and everything inside it, e.g. the incognito toggle)
    // never remounts across the centered → docked transition — the same
    // DOM node from before the send is still the one on screen.
    expect(screen.getByRole('button', { name: "Incognito — don't save this conversation" })).toBe(
      incognitoToggle,
    );
  });
});

describe('ChatView — interrupted stream', () => {
  /** A 200 response whose body starts streaming, then fails mid-read —
   *  a dropped connection, a server crash, or a provider-side deadline
   *  destroying the socket. */
  function failingStreamResponse(framesBeforeFailure: object[] = []): Response {
    const encoder = new TextEncoder();
    let delivered = 0;
    // Pull-based, not a single `start()` burst: erroring a stream discards
    // anything still queued, so the frames have to be handed over one pull
    // at a time and the failure raised on a later pull for the partial-text
    // case to be reachable at all.
    const body = new ReadableStream({
      pull(controller) {
        if (delivered < framesBeforeFailure.length) {
          const frame = framesBeforeFailure[delivered++];
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
          return;
        }
        controller.error(new Error('network died'));
      },
    });
    return new Response(body, { status: 200 });
  }

  it('recovers the composer when the stream fails before any token arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failingStreamResponse()));
    renderChatView();

    sendMessage('hello');

    // The regression: state stayed 'streaming' forever, leaving every
    // control disabled with no way back except a page reload.
    await waitFor(() =>
      expect(screen.getByLabelText('Message Warden')).toHaveProperty('disabled', false),
    );
    expect(screen.getByRole('alert').textContent).toBe('The response was interrupted.');
    // Send is legitimately disabled on an empty composer, so prove recovery
    // by typing again rather than by asserting on the cleared state.
    fireEvent.change(screen.getByLabelText('Message Warden'), { target: { value: 'retry' } });
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', false);
  });

  it('keeps a partial reply and still surfaces the interruption', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(failingStreamResponse([{ type: 'token', text: 'partial ' }])),
    );
    renderChatView();

    sendMessage('hello');

    await waitFor(() => expect(screen.getByText('partial')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toBe('The response was interrupted.');
    expect(screen.getByLabelText('Message Warden')).toHaveProperty('disabled', false);
  });
});

describe('ChatView — stop and copy', () => {
  /** Never resolves on its own, so the request stays in flight until aborted. */
  function hangingFetch() {
    return vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
  }

  it('swaps Send for Stop while streaming, and cancels the request', async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderChatView();

    sendMessage('hello');

    const stop = await screen.findByRole('button', { name: 'Stop' });
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);

    fireEvent.click(stop);

    await waitFor(() => expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true));
    // A cancel is the user getting what they asked for — no error banner,
    // and definitely not the blocking "unavailable" state.
    await waitFor(() =>
      expect(screen.getByLabelText('Message Warden')).toHaveProperty('disabled', false),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Warden is unavailable')).toBeNull();
  });

  it('aborts an in-flight request when the component unmounts', async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderChatView();

    sendMessage('hello');
    await screen.findByRole('button', { name: 'Stop' });

    unmount();

    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('offers a copy action on assistant replies only', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(sseResponse([{ type: 'token', text: 'the reply' }, { type: 'done' }])),
    );

    renderChatView();
    sendMessage('hi');
    await waitFor(() => expect(screen.getByText('the reply')).toBeDefined());

    // One assistant turn, one copy button — the user turn has none.
    const copyButtons = await screen.findAllByRole('button', { name: 'Copy this reply' });
    expect(copyButtons).toHaveLength(1);

    fireEvent.click(copyButtons[0]);
    expect(writeText).toHaveBeenCalledWith('the reply');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined());
  });
});

describe('ChatView — markdown rendering', () => {
  const assistantMarkdown = {
    id: '2',
    role: 'assistant' as const,
    content: '**What is rain?**\n\n1. Evaporation\n2. Condensation\n\n```js\nconst a = 1;\n```',
    providerId: null,
    model: 'local',
    createdAt: 2,
  };

  it('renders an assistant reply as markdown, not raw asterisks', () => {
    const { container } = renderChatView({ initialMessages: [assistantMarkdown] });

    expect(container.querySelector('strong')?.textContent).toBe('What is rain?');
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('pre code')?.textContent).toBe('const a = 1;');
    expect(screen.queryByText(/\*\*What is rain\?\*\*/)).toBeNull();
  });

  it('leaves a user turn verbatim — they typed text, not markup', () => {
    const { container } = renderChatView({
      initialMessages: [
        {
          id: '1',
          role: 'user',
          content: 'what does **this** mean?',
          providerId: null,
          model: 'local',
          createdAt: 1,
        },
      ],
    });

    expect(container.querySelector('strong')).toBeNull();
    expect(screen.getByText('what does **this** mean?')).toBeDefined();
  });

  it('renders streaming text as markdown as it arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(sseResponse([{ type: 'token', text: '# Heading' }, { type: 'done' }])),
    );
    const { container } = renderChatView();

    sendMessage('hi');

    await waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Heading'));
  });

  it('shows a standing incognito banner and only one incognito control', () => {
    renderChatView();
    expect(screen.queryByRole('status')).toBeNull();
    const toggles = screen.getAllByRole('button', {
      name: "Incognito — don't save this conversation",
    });
    // The composer's duplicate was removed — one control for one mode.
    expect(toggles).toHaveLength(1);

    const toggle = screen.getByRole('button', {
      name: "Incognito — don't save this conversation",
    });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);

    // A banner that persists past the empty state, which disappears on the
    // first send — exactly when forgetting the mode starts to matter.
    expect(screen.getByRole('status').textContent).toContain('isn');
    expect(
      screen
        .getByRole('button', { name: "Incognito — don't save this conversation" })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
