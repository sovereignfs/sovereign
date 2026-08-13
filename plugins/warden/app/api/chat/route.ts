import { NextResponse } from 'next/server';
import { NotAuthenticatedError, sdk } from '@sovereignfs/sdk';
import { requestHarnessChat, type ChatMessage } from '../../_lib/harness-client';

/**
 * Proxies a chat completion to `apps/harness`'s internal `/api/chat` (RFC
 * 0063 §4, epic task 22.3). A plugin-owned Route Handler, not a server
 * action — the only way to stream `apps/harness`'s own SSE response
 * incrementally to the browser. See CURRENT_TASK.md's design decisions for
 * why this is architecturally sound (composes to `/warden/api/chat`, never
 * touches the top-level `/api/*` public-namespace-delegation mechanism).
 *
 * Session-gated same as every other plugin surface — `requireSession()` is
 * called explicitly here (architecture-rules.md: middleware path gating
 * alone is not enough, applies to a Route Handler exactly as it does to a
 * server action).
 *
 * On success, this is a transparent proxy: `apps/harness`'s own SSE frames
 * (`{type: 'token'|'done'|'error', ...}`) pass straight through, unchanged.
 * Pre-flight failures are translated into a small set of states the client
 * UI branches on: `unavailable`, `model_not_ready`, `rate_limited`, `error`.
 */

interface ChatRequestBody {
  messages?: unknown;
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m): m is ChatMessage =>
        typeof m === 'object' &&
        m !== null &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
        typeof (m as ChatMessage).content === 'string',
    )
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    await sdk.auth.requireSession();
  } catch (error) {
    if (error instanceof NotAuthenticatedError) {
      return NextResponse.json(
        { status: 'error', message: 'You must be signed in to use Warden.' },
        { status: 401 },
      );
    }
    throw error;
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  if (!isValidMessages(body.messages)) {
    return NextResponse.json(
      { status: 'error', message: 'messages must be a non-empty array of {role, content}.' },
      { status: 400 },
    );
  }

  const result = await requestHarnessChat(body.messages);

  switch (result.kind) {
    case 'stream':
      return new Response(result.response.body, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
      });
    case 'unavailable':
      return NextResponse.json({ status: 'unavailable', message: result.message }, { status: 503 });
    case 'model_not_ready':
      return NextResponse.json(
        { status: 'model_not_ready', message: result.message, modelStatus: result.modelStatus },
        { status: 503 },
      );
    case 'rate_limited':
      return NextResponse.json(
        { status: 'rate_limited', message: result.message },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
      );
    case 'error':
      return NextResponse.json({ status: 'error', message: result.message }, { status: 502 });
  }
}
