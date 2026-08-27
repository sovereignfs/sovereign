import { NextResponse } from 'next/server';
import { NotAuthenticatedError, sdk } from '@sovereignfs/sdk';
import { appendMessage, getRecentMessagesForContext } from '../../_lib/conversations';
import { requestHarnessChat, type ChatMessage } from '../../_lib/harness-client';
import { MAX_INPUT_CHARS, MAX_OUTPUT_TOKENS, MAX_RECENT_TURNS } from '../../_lib/limits';
import { getProviderApiKey, listProviders } from '../../_lib/providers';
import { requestProviderChat } from '../../_lib/provider-chat';
import { teeAndCapture } from '../../_lib/stream-capture';

/**
 * Warden's chat completion endpoint (RFC 0063 §4/§5, epic tasks 22.3-22.5).
 * A plugin-owned Route Handler, not a server action — the only way to
 * stream a completion incrementally to the browser. Session-gated
 * explicitly (`docs/architecture-rules.md`: middleware path gating alone
 * is not enough).
 *
 * Two request shapes, both requiring `modelKey` (`'local'`, or
 * `<connectionId>:<modelId>` from `discoverModels()`):
 *
 * - **Persisted (default):** `{ modelKey, content }` — the new user
 *   message only. The server is the source of truth for history: it loads
 *   the last `MAX_RECENT_TURNS` from `warden_messages`, appends the user's
 *   message, and persists the assistant's reply once streaming completes
 *   (via `teeAndCapture` — the client is never blocked on this).
 * - **Incognito:** `{ modelKey, incognito: true, messages }` — the
 *   client's own scratch transcript so far, exactly like the original
 *   phase-1 ephemeral design (`harness-client.ts`'s shape, unchanged nothing
 *   is ever written to `warden_messages`.
 *
 * On success this is a transparent proxy either way: both the local
 * (`apps/harness`) and external-provider paths already produce the same
 * `{type: 'token'|'done'|'error', ...}` SSE frame shape.
 */

interface ChatRequestBody {
  modelKey?: unknown;
  incognito?: unknown;
  content?: unknown;
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

type ModelSelection =
  | { kind: 'local' }
  | { kind: 'provider'; providerId: string; model: string; baseUrl: string; apiKey: string }
  | { kind: 'invalid'; message: string };

async function resolveModelSelection(modelKey: string): Promise<ModelSelection> {
  if (modelKey === 'local') return { kind: 'local' };

  const separatorIndex = modelKey.indexOf(':');
  if (separatorIndex === -1) return { kind: 'invalid', message: 'Unknown model selection.' };
  const providerId = modelKey.slice(0, separatorIndex);
  const model = modelKey.slice(separatorIndex + 1);

  const providers = await listProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return { kind: 'invalid', message: 'That provider no longer exists.' };

  const apiKey = await getProviderApiKey(providerId);
  if (!apiKey) return { kind: 'invalid', message: 'That provider has no stored API key.' };

  return { kind: 'provider', providerId, model, baseUrl: provider.baseUrl, apiKey };
}

export async function POST(request: Request): Promise<Response> {
  let session: Awaited<ReturnType<typeof sdk.auth.requireSession>>;
  try {
    session = await sdk.auth.requireSession();
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

  const modelKey = typeof body.modelKey === 'string' ? body.modelKey : '';
  if (!modelKey) {
    return NextResponse.json(
      { status: 'error', message: 'A model selection is required.' },
      { status: 400 },
    );
  }

  const incognito = body.incognito === true;
  let messages: ChatMessage[];
  let userContent: string | null = null;

  if (incognito) {
    if (!isValidMessages(body.messages)) {
      return NextResponse.json(
        { status: 'error', message: 'messages must be a non-empty array of {role, content}.' },
        { status: 400 },
      );
    }
    messages = body.messages;
  } else {
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return NextResponse.json(
        { status: 'error', message: 'A message is required.' },
        { status: 400 },
      );
    }
    userContent = content;
    const recent = await getRecentMessagesForContext(
      session.user.id,
      session.user.tenantId,
      MAX_RECENT_TURNS,
    );
    messages = [
      ...recent.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];
  }

  const latestContent = messages[messages.length - 1]?.content ?? '';
  if (latestContent.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { status: 'error', message: `Messages are limited to ${MAX_INPUT_CHARS} characters.` },
      { status: 400 },
    );
  }

  const selection = await resolveModelSelection(modelKey);
  if (selection.kind === 'invalid') {
    return NextResponse.json({ status: 'error', message: selection.message }, { status: 400 });
  }

  const result =
    selection.kind === 'local'
      ? await requestHarnessChat(messages, MAX_OUTPUT_TOKENS)
      : await requestProviderChat({
          baseUrl: selection.baseUrl,
          apiKey: selection.apiKey,
          model: selection.model,
          messages,
        });

  if (result.kind === 'stream') {
    let response = new Response(result.response.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });

    if (!incognito && userContent !== null) {
      const providerId = selection.kind === 'provider' ? selection.providerId : null;
      const model = selection.kind === 'provider' ? selection.model : 'local';
      // Persist the user's side immediately — it's already known, no need
      // to wait for the reply. The assistant's side is persisted once
      // `teeAndCapture` finishes accumulating it; the client is never
      // blocked on either write.
      void appendMessage(session.user.id, session.user.tenantId, {
        role: 'user',
        content: userContent,
        providerId,
        model,
      }).catch((error) => console.error('[warden] failed to persist user message:', error));

      response = teeAndCapture(response, ({ text }) => {
        if (!text) return;
        void appendMessage(session.user.id, session.user.tenantId, {
          role: 'assistant',
          content: text,
          providerId,
          model,
        }).catch((error) => console.error('[warden] failed to persist assistant message:', error));
      });
    }

    return response;
  }

  switch (result.kind) {
    case 'unavailable':
    case 'auth_failed':
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
