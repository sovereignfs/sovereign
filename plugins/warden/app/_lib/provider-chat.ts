import {
  assertSafeProviderBaseUrl,
  UnsafeProviderUrlError,
  type SafeProviderUrl,
} from './url-safety';
import { pinnedFetch } from './pinned-fetch';
import { MAX_OUTPUT_TOKENS, REQUEST_TIMEOUT_MS } from './limits';
import type { ChatMessage } from './harness-client';

export type ProviderChatResult =
  | { kind: 'stream'; response: Response }
  | { kind: 'unavailable'; message: string }
  | { kind: 'auth_failed'; message: string }
  | { kind: 'error'; message: string };

interface OpenAiStreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * Turns an upstream OpenAI-compatible SSE stream into Warden's own frame
 * shape (`{type: 'token'|'done'|'error', text?, message?}`) — the same
 * shape `apps/harness`'s local path already produces and `ChatView`/
 * `teeAndCapture` already parse, so the route handler and client don't
 * need to know which kind of provider answered.
 */
function toWardenFrames(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      let buffer = '';
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
            if (payload === '[DONE]') continue;
            let parsed: OpenAiStreamChunk;
            try {
              parsed = JSON.parse(payload);
            } catch {
              continue;
            }
            const text = parsed.choices?.[0]?.delta?.content;
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'token', text })}\n\n`),
              );
            }
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'The response was interrupted.' })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Requests a chat completion from a user-configured external provider
 * (RFC 0063 §5, epic task 22.5). Re-validates the base URL immediately
 * before the request, then connects to the validated address directly
 * (`pinnedFetch`) rather than a fresh `fetch(url)` — closes the DNS-rebind
 * window a second, independent DNS lookup would otherwise leave open, same
 * reasoning as `model-discovery.ts`.
 */
export async function requestProviderChat(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
}): Promise<ProviderChatResult> {
  let safe: SafeProviderUrl;
  try {
    safe = await assertSafeProviderBaseUrl(input.baseUrl);
  } catch (error) {
    return {
      kind: 'unavailable',
      message:
        error instanceof UnsafeProviderUrlError ? error.message : 'This provider is unreachable.',
    };
  }

  const endpoint = new URL(`${safe.url.toString().replace(/\/$/, '')}/chat/completions`);
  let upstream: Response;
  try {
    upstream = await pinnedFetch(endpoint, safe.pinnedAddress, safe.pinnedFamily, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'unavailable', message: 'This provider is unreachable.' };
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return { kind: 'auth_failed', message: 'This provider rejected the API key.' };
  }
  if (!upstream.ok || !upstream.body) {
    const body: { error?: { message?: string } } = await upstream.json().catch(() => ({}));
    return {
      kind: 'error',
      message: body.error?.message ?? `This provider returned an error (${upstream.status}).`,
    };
  }

  return { kind: 'stream', response: new Response(toWardenFrames(upstream.body), { status: 200 }) };
}
