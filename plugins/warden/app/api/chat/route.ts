import { NextResponse } from 'next/server';
import { NotAuthenticatedError, sdk } from '@sovereignfs/sdk';
import { composeDocumentContent, processAttachment } from '../../_lib/attachments';
import {
  appendMessage,
  createSession,
  getRecentMessagesForContext,
  SessionNotFoundError,
} from '../../_lib/sessions';
import {
  requestHarnessChat,
  type ChatMessage,
  type ChatMessageContentPart,
} from '../../_lib/harness-client';
import {
  describeImageForHistory,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_RECENT_TURNS,
} from '../../_lib/limits';
import { getProviderApiKey, listProviders } from '../../_lib/providers';
import { requestProviderChat, type ProviderChatResult } from '../../_lib/provider-chat';
import { teeAndCapture } from '../../_lib/stream-capture';
import type { HarnessChatResult } from '../../_lib/harness-client';

/**
 * Warden's chat completion endpoint (RFC 0063 §4/§5, epic tasks 22.3-22.5).
 * A plugin-owned Route Handler, not a server action — the only way to
 * stream a completion incrementally to the browser. Session-gated
 * explicitly (`docs/architecture-rules.md`: middleware path gating alone
 * is not enough).
 *
 * Deliberately no `export const runtime = 'edge'` here, and never add one:
 * `unpdf`'s PDF extraction (`attachments.ts`) needs the Node runtime, and
 * `request.formData()` for a multi-megabyte attachment needs it too. This
 * route gets Node by default today — keep it that way.
 *
 * Three request shapes, all requiring `modelKey` (`'local'`, or
 * `<connectionId>:<modelId>` from `discoverModels()`):
 *
 * - **Persisted (default):** JSON `{ modelKey, sessionId?, content }` — the
 *   new user message only. `sessionId` selects an existing session
 *   (ownership-checked); omitting it creates a new one lazily (RFC 0063
 *   §3/§10, epic task 22.8) — the response's `x-warden-session-id` header
 *   carries the resolved id back so the client can reuse it on the next
 *   send. The server is the source of truth for history: it loads the last
 *   `MAX_RECENT_TURNS` from that session's own messages, appends the
 *   user's message, and persists the assistant's reply once streaming
 *   completes (via `teeAndCapture` — the client is never blocked on this).
 * - **Incognito:** JSON `{ modelKey, incognito: true, messages }` — the
 *   client's own scratch transcript so far, exactly like the original
 *   phase-1 ephemeral design. Carries no `sessionId` at all — incognito is
 *   a single global scratch context orthogonal to session selection (RFC
 *   0063 §6/§10), not a per-session mode. Never combined with an
 *   attachment — the client hides/disables the attach control while
 *   incognito is on, and this route rejects the combination defensively.
 * - **Persisted + attachment:** `multipart/form-data` with `modelKey`,
 *   `sessionId?`, `content`, and a `file` field (an image or a PDF/text
 *   document). Images are sent to the model as multimodal content for this
 *   one turn only and are never persisted — history shows a text
 *   placeholder instead (`describeImageForHistory`). Documents are
 *   extracted to plain text server-side and folded into the message as
 *   ordinary text, so they work identically to a persisted-mode text
 *   message from that point on (no gating, no special persistence
 *   handling).
 *
 * On success this is a transparent proxy either way: both the local
 * (`apps/harness`) and external-provider paths already produce the same
 * `{type: 'token'|'done'|'error', ...}` SSE frame shape.
 */

interface ChatRequestBody {
  modelKey?: unknown;
  incognito?: unknown;
  sessionId?: unknown;
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

/** A discriminated union (not a flat interface) so the compiler proves
 *  `messages` and `userTypedText`/`file` can never be confused for one
 *  another — the incognito path never carries an attachment, by type, not
 *  just by convention. `sessionId` only exists on the non-incognito branch
 *  — incognito never references a session at all (RFC 0063 §10). */
type ParsedRequest = { modelKey: string } & (
  | { incognito: true; messages: ChatMessage[] }
  | { incognito: false; sessionId: string | null; userTypedText: string; file: File | null }
);

type ParseResult = { ok: true; parsed: ParsedRequest } | { ok: false; response: Response };

function badRequest(message: string): Response {
  return NextResponse.json({ status: 'error', message }, { status: 400 });
}

async function parseRequest(request: Request): Promise<ParseResult> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.toLowerCase().includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return { ok: false, response: badRequest('Could not read the uploaded file.') };
    }
    if (formData.get('incognito')) {
      return {
        ok: false,
        response: badRequest('Attachments are not available in incognito mode.'),
      };
    }
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, response: badRequest('An attachment is required for this request.') };
    }
    const modelKeyField = formData.get('modelKey');
    const sessionIdField = formData.get('sessionId');
    return {
      ok: true,
      parsed: {
        modelKey: typeof modelKeyField === 'string' ? modelKeyField : '',
        incognito: false,
        sessionId: typeof sessionIdField === 'string' && sessionIdField ? sessionIdField : null,
        userTypedText: String(formData.get('content') ?? '').trim(),
        file,
      },
    };
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: badRequest('Request body must be valid JSON.') };
  }

  const modelKey = typeof body.modelKey === 'string' ? body.modelKey : '';

  if (body.incognito === true) {
    if (!isValidMessages(body.messages)) {
      return {
        ok: false,
        response: badRequest('messages must be a non-empty array of {role, content}.'),
      };
    }
    return { ok: true, parsed: { modelKey, incognito: true, messages: body.messages } };
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null;
  return {
    ok: true,
    parsed: { modelKey, incognito: false, sessionId, userTypedText: content, file: null },
  };
}

/** Shared dispatch + SSE/error-mapping tail for both request shapes.
 *  `persist` is `null` for incognito — nothing is ever written to
 *  `warden_messages` in that mode. */
async function dispatchAndRespond(
  selection: Exclude<ModelSelection, { kind: 'invalid' }>,
  messages: ChatMessage[],
  persist: {
    userId: string;
    tenantId: string;
    sessionId: string;
    providerId: string | null;
    model: string;
    contentForPersistence: string;
  } | null,
): Promise<Response> {
  const result: HarnessChatResult | ProviderChatResult =
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
        // Carries a lazily-created session's id back to the client — the
        // only way to hand back data alongside a streaming body's headers.
        ...(persist ? { 'x-warden-session-id': persist.sessionId } : {}),
      },
    });

    if (persist) {
      // Persist the user's side immediately — it's already known, no need
      // to wait for the reply. The assistant's side is persisted once
      // `teeAndCapture` finishes accumulating it; the client is never
      // blocked on either write.
      void appendMessage(persist.userId, persist.tenantId, persist.sessionId, {
        role: 'user',
        content: persist.contentForPersistence,
        providerId: persist.providerId,
        model: persist.model,
      }).catch((error) => console.error('[warden] failed to persist user message:', error));

      response = teeAndCapture(response, ({ text }) => {
        if (!text) return;
        void appendMessage(persist.userId, persist.tenantId, persist.sessionId, {
          role: 'assistant',
          content: text,
          providerId: persist.providerId,
          model: persist.model,
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

  const parseResult = await parseRequest(request);
  if (!parseResult.ok) return parseResult.response;
  const parsed = parseResult.parsed;

  if (!parsed.modelKey) return badRequest('A model selection is required.');

  if (parsed.incognito) {
    const lastContent = parsed.messages[parsed.messages.length - 1]?.content;
    if (typeof lastContent === 'string' && lastContent.length > MAX_INPUT_CHARS) {
      return badRequest(`Messages are limited to ${MAX_INPUT_CHARS} characters.`);
    }

    const selection = await resolveModelSelection(parsed.modelKey);
    if (selection.kind === 'invalid') return badRequest(selection.message);

    return dispatchAndRespond(selection, parsed.messages, null);
  }

  if (!parsed.userTypedText) return badRequest('A message is required.');
  if (parsed.userTypedText.length > MAX_INPUT_CHARS) {
    return badRequest(`Messages are limited to ${MAX_INPUT_CHARS} characters.`);
  }

  const processedAttachment = parsed.file ? await processAttachment(parsed.file) : null;
  if (processedAttachment && !processedAttachment.ok) {
    return badRequest(processedAttachment.error);
  }
  const attachment = processedAttachment?.ok ? processedAttachment.attachment : null;

  const selection = await resolveModelSelection(parsed.modelKey);
  if (selection.kind === 'invalid') return badRequest(selection.message);

  if (selection.kind === 'local' && attachment?.kind === 'image') {
    return badRequest(
      'The local model is text-only and doesn’t support images. Choose a different model or remove the attachment.',
    );
  }

  let contentForModel: string | ChatMessageContentPart[];
  let contentForPersistence: string;

  if (!attachment) {
    contentForModel = parsed.userTypedText;
    contentForPersistence = parsed.userTypedText;
  } else if (attachment.kind === 'image') {
    contentForModel = [
      { type: 'text', text: parsed.userTypedText },
      { type: 'image_url', image_url: { url: attachment.dataUrl } },
    ];
    contentForPersistence = describeImageForHistory(parsed.userTypedText, attachment.filename);
  } else {
    contentForModel = composeDocumentContent(parsed.userTypedText, attachment);
    contentForPersistence = contentForModel;
  }

  // A given `sessionId` is ownership-checked by `getRecentMessagesForContext`
  // itself (it throws `SessionNotFoundError` for a foreign/unknown id, never
  // silently substituting a different session); omitting it creates a new
  // one lazily — not on "+ New" being clicked, only on an actual first send
  // (RFC 0063 §3/§10).
  const sessionId =
    parsed.sessionId ?? (await createSession(session.user.id, session.user.tenantId)).id;

  let recent;
  try {
    recent = await getRecentMessagesForContext(
      session.user.id,
      session.user.tenantId,
      sessionId,
      MAX_RECENT_TURNS,
    );
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return badRequest('That session no longer exists.');
    }
    throw error;
  }
  const messages: ChatMessage[] = [
    ...recent.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: contentForModel },
  ];

  return dispatchAndRespond(selection, messages, {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    sessionId,
    providerId: selection.kind === 'provider' ? selection.providerId : null,
    model: selection.kind === 'provider' ? selection.model : 'local',
    contentForPersistence,
  });
}
