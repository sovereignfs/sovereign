/**
 * Persisting an assistant reply means the server must know the full text
 * once streaming finishes — but the whole point of streaming is that the
 * server doesn't have it all up front. `tee()`s the response body: one
 * branch goes to the client unchanged, the other is consumed in the
 * background to accumulate the same `{type:'token'|'done'|'error', ...}`
 * frames (RFC 0063 §4's shape, produced by both the local and external
 * provider paths) into the final text, then calls `onComplete` — the
 * client never waits on this.
 */
export function teeAndCapture(
  response: Response,
  onComplete: (result: { text: string; errorMessage: string | null }) => void,
): Response {
  if (!response.body) {
    onComplete({ text: '', errorMessage: null });
    return response;
  }
  const [clientStream, captureStream] = response.body.tee();

  void (async () => {
    const reader = captureStream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let errorMessage: string | null = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice('data:'.length).trim();
          let frame: { type?: string; text?: string; message?: string };
          try {
            frame = JSON.parse(payload);
          } catch {
            continue;
          }
          if (frame.type === 'token' && frame.text) text += frame.text;
          else if (frame.type === 'error')
            errorMessage = frame.message ?? 'The response was interrupted.';
        }
      }
    } catch {
      errorMessage = errorMessage ?? 'The response was interrupted.';
    } finally {
      onComplete({ text, errorMessage });
    }
  })();

  return new Response(clientStream, { status: response.status, headers: response.headers });
}
