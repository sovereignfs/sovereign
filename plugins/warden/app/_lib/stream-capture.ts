export interface CaptureResult {
  /** Every `token` frame's text, concatenated — the reply as the client saw it. */
  text: string;
  errorMessage: string | null;
  /** True when the client went away before the upstream finished (Stop, a
   *  closed tab, a navigation). `text` is then whatever had streamed so far. */
  cancelled: boolean;
}

export interface CaptureOptions {
  /**
   * Runs once the upstream has ended (or the client cancelled). Awaited
   * before the client-facing stream emits its final `done` frame — so by
   * the time the browser sees `done`, whatever this persisted is durable.
   */
  onComplete: (result: CaptureResult) => Promise<void> | void;
}

const DONE_FRAME = 'data: {"type":"done"}\n\n';

/**
 * Persisting an assistant reply means the server must know the full text
 * once streaming finishes — but the whole point of streaming is that the
 * server doesn't have it all up front. This wraps the upstream body in a
 * stream that forwards every frame to the client as it arrives while
 * accumulating the same `{type:'token'|'done'|'error', ...}` frames (RFC
 * 0063 §4's shape, produced by both the local and external provider paths)
 * into the final text.
 *
 * Two behaviours that a plain `tee()` (the previous implementation) could
 * not provide:
 *
 * - **`done` is withheld until `onComplete` has resolved.** With a tee, the
 *   client's copy of `done` and the server's persistence write raced, so a
 *   client that re-fetched the conversation the moment its stream ended
 *   (`ChatView` after a brand-new session's first send) could read the
 *   database before the reply had landed and render the turn without it.
 *   Now the upstream's own `done` frame is dropped and a fresh one is
 *   emitted only after persistence — the browser never sees `done` for a
 *   reply that is not yet on disk.
 * - **Cancellation reaches upstream.** Cancelling one branch of a tee leaves
 *   the other draining the provider to completion: after Stop, the model
 *   kept generating (and billing) and the *full* reply was persisted while
 *   the screen showed a partial one. Cancelling this stream cancels the
 *   upstream reader — which aborts the provider request — and persists
 *   exactly the text the user saw, flagged `cancelled`.
 *
 * Frames are forwarded line-by-line, never mid-line: a chunk boundary can
 * split a frame, and the only frame this needs to recognise (`done`) has to
 * be parsed whole to be dropped.
 */
export function captureAndPersist(response: Response, options: CaptureOptions): Response {
  if (!response.body) {
    void options.onComplete({ text: '', errorMessage: null, cancelled: false });
    return response;
  }

  const upstream = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let text = '';
  let errorMessage: string | null = null;
  let completed = false;
  let cancelled = false;

  function complete(): Promise<void> | void {
    if (completed) return;
    completed = true;
    return options.onComplete({ text, errorMessage, cancelled });
  }

  /** Records a complete SSE line's frame; returns false for a `done` frame,
   *  which is not forwarded (a fresh one is emitted after persistence). */
  function captureLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return true;
    let frame: { type?: string; text?: string; message?: string };
    try {
      frame = JSON.parse(trimmed.slice('data:'.length).trim());
    } catch {
      return true;
    }
    if (frame.type === 'token' && frame.text) text += frame.text;
    else if (frame.type === 'error')
      errorMessage = frame.message ?? 'The response was interrupted.';
    else if (frame.type === 'done') return false;
    return true;
  }

  const body = new ReadableStream<Uint8Array>({
    // Loops until it has actually enqueued something (or the upstream has
    // ended): a `pull` that resolves without enqueueing is not re-invoked
    // while a read is already waiting, so returning early on a chunk that
    // held only a partial line — or only a dropped `done` frame — would
    // stall the client for good.
    async pull(controller) {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await upstream.read();
        } catch {
          errorMessage = errorMessage ?? 'The response was interrupted.';
          chunk = { done: true, value: undefined };
        }

        // `cancel` below resolves the pending `upstream.read()` with
        // `done: true` — finalizing belongs to it in that case, and this
        // controller no longer accepts writes.
        if (cancelled) return;

        if (chunk.done) {
          // Upstream ended. Flush a trailing partial line (a final frame
          // with no newline after it), persist, then — and only then — tell
          // the client.
          buffer += decoder.decode();
          if (buffer && captureLine(buffer)) controller.enqueue(encoder.encode(`${buffer}\n`));
          buffer = '';
          try {
            await complete();
          } catch (error) {
            console.error('[warden] failed to finalize a streamed reply:', error);
          }
          controller.enqueue(encoder.encode(DONE_FRAME));
          controller.close();
          return;
        }

        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        const forwarded = lines.filter(captureLine);
        // Blank separator lines alone (what's left of a dropped `done`
        // frame) are not worth a write of their own.
        if (forwarded.some((line) => line.trim() !== '')) {
          controller.enqueue(encoder.encode(`${forwarded.join('\n')}\n`));
          return;
        }
      }
    },
    async cancel(reason) {
      // The client is gone. Stop the provider (cancelling a fetch body's
      // reader aborts the request) and keep what the user actually saw.
      cancelled = true;
      await upstream.cancel(reason).catch(() => {});
      try {
        await complete();
      } catch (error) {
        console.error('[warden] failed to finalize a cancelled reply:', error);
      }
    },
  });

  return new Response(body, { status: response.status, headers: response.headers });
}
