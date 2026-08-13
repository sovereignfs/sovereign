import { NextResponse } from 'next/server';
import { engineKind, enrollmentConfigured, requestLimits } from '../../../src/config';
import { getEngine } from '../../../src/engine';
import type { ChatMessage } from '../../../src/engine';
import { verifyEnrollmentToken } from '../../../src/enrollment';
import { getModelStatus } from '../../../src/model';
import { checkChatRateLimit, releaseChatSlot, tryAcquireChatSlot } from '../../../src/rate-limit';

/**
 * Internal-only chat completion API — Warden's server-side code is the
 * sole intended caller (RFC 0063 §4). Not literally OpenAI-compatible;
 * this task's own narrow contract (CURRENT_TASK.md's design decisions),
 * since a wider surface has no second consumer to justify it in phase 1.
 *
 * Auth: `Authorization: Bearer <enrollment token>`, verified via
 * src/enrollment.ts (the reused apps/relay pattern). Every other failure
 * mode below maps directly to RFC 0063 §6's table.
 */

interface ChatRequestBody {
  messages?: unknown;
  maxTokens?: unknown;
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m): m is ChatMessage =>
        typeof m === 'object' &&
        m !== null &&
        (m as ChatMessage).role !== undefined &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
        typeof (m as ChatMessage).content === 'string',
    )
  );
}

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request): Promise<Response> {
  if (!enrollmentConfigured()) {
    return NextResponse.json(
      {
        error: 'not_configured',
        message: 'apps/harness enrollment is not configured on this instance.',
      },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const enrollment = token ? verifyEnrollmentToken(token) : null;
  if (!enrollment) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Missing or invalid enrollment token.' },
      { status: 401 },
    );
  }

  const rateLimit = checkChatRateLimit(enrollment.instanceId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many chat requests.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    );
  }

  // Model-not-ready check only applies to the real engine — the fake
  // engine (CI/tests) never needs a downloaded model.
  if (engineKind() !== 'fake') {
    const model = getModelStatus();
    if (model.status !== 'ready') {
      return NextResponse.json(
        {
          error: 'model_not_ready',
          message:
            model.status === 'error'
              ? `Model download failed: ${model.error}`
              : 'The chat model is still downloading. Try again shortly.',
          modelStatus: model.status,
        },
        { status: 503 },
      );
    }
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  if (!isValidMessages(body.messages)) {
    return NextResponse.json(
      { error: 'bad_request', message: 'messages must be a non-empty array of {role, content}.' },
      { status: 400 },
    );
  }

  const limits = requestLimits();

  // Max recent turns: keep only the most recent N messages, oldest first —
  // a coarse but simple context-window guard (RFC 0063 §6).
  const recentMessages = body.messages.slice(-limits.maxRecentTurns);

  const totalInputChars = recentMessages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalInputChars > limits.maxInputChars) {
    return NextResponse.json(
      {
        error: 'input_too_long',
        message: `Combined message length (${totalInputChars} chars) exceeds the ${limits.maxInputChars} char limit.`,
      },
      { status: 400 },
    );
  }

  const requestedMaxTokens =
    typeof body.maxTokens === 'number' && body.maxTokens > 0
      ? body.maxTokens
      : limits.maxOutputTokens;
  const maxTokens = Math.min(requestedMaxTokens, limits.maxOutputTokens);

  if (!tryAcquireChatSlot(limits.maxConcurrency)) {
    return NextResponse.json(
      {
        error: 'concurrency_limit',
        message: 'The chat engine is at capacity. Try again shortly.',
      },
      { status: 503 },
    );
  }

  const engine = getEngine();
  const timeoutMs = limits.timeoutSeconds * 1000;

  // Guards the concurrency slot against double-release: normal completion
  // releases via start()'s finally, but a client that stops reading (drops
  // the connection, aborts) never reaches that finally on its own —
  // ReadableStream's cancel() is the only hook that fires for that case.
  // Without this, an abandoned stream would leak its slot permanently.
  let slotReleased = false;
  function releaseSlotOnce() {
    if (slotReleased) return;
    slotReleased = true;
    releaseChatSlot();
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.enqueue(encoder.encode(sseFrame({ type: 'error', message: 'timeout' })));
        controller.close();
      }, timeoutMs);

      try {
        for await (const chunk of engine.chat(recentMessages, maxTokens)) {
          if (timedOut) break;
          controller.enqueue(encoder.encode(sseFrame(chunk)));
          if (chunk.type === 'done' || chunk.type === 'error') break;
        }
      } catch {
        if (!timedOut) {
          controller.enqueue(
            encoder.encode(sseFrame({ type: 'error', message: 'internal_error' })),
          );
        }
      } finally {
        clearTimeout(timeout);
        releaseSlotOnce();
        if (!timedOut) controller.close();
      }
    },
    cancel() {
      releaseSlotOnce();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
