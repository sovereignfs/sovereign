import { NextResponse } from 'next/server';
import { NotAuthenticatedError, sdk } from '@sovereignfs/sdk';
import { composeDocumentContent, processAttachment } from '../../_lib/attachments';
import {
  appendMessage,
  createSession,
  deleteMessage,
  deleteSession,
  extendMessage,
  getRecentMessagesForContext,
  replaceMessage,
  SessionNotFoundError,
  type MessageView,
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
import { CONTINUE_INSTRUCTION, isReplyMode, type ReplyMode } from '../../_lib/reply-modes';
import { captureAndPersist } from '../../_lib/stream-capture';
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
 * - **Persisted (default):** JSON `{ modelKey, sessionId?, content, mode? }`
 *   — the new user message only. `sessionId` selects an existing session
 *   (ownership-checked); omitting it creates a new one lazily (RFC 0063
 *   §3/§10, epic task 22.8) — the response's `x-warden-session-id` header
 *   carries the resolved id back so the client can reuse it on the next
 *   send. The server is the source of truth for history: it loads the last
 *   `MAX_RECENT_TURNS` from that session's own messages, appends the
 *   user's message, and persists the assistant's reply once streaming
 *   completes (via `captureAndPersist`, which withholds the stream's `done`
 *   frame until that write has landed).
 * - **Incognito:** JSON `{ modelKey, incognito: true, messages, mode? }` —
 *   the client's own scratch transcript so far, exactly like the original
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
 * `mode` (`reply-modes.ts`) refines what a persisted request does to the
 * thread: `send` (default) appends a user turn; `continue` extends the last
 * reply in place; `regenerate` overwrites it once a fresh one has streamed;
 * `edit` replaces the last user turn and its reply. Incognito supports
 * `send` and `continue` only — the client owns that transcript, so it trims
 * it itself for the other two and sends the result as an ordinary `send`.
 *
 * On success this is a transparent proxy either way: both the local
 * (`apps/harness`) and external-provider paths already produce the same
 * `{type: 'token'|'done'|'error', ...}` SSE frame shape, plus a `truncated`
 * frame ahead of `done` when the reply hit the output cap.
 */

interface ChatRequestBody {
  modelKey?: unknown;
  incognito?: unknown;
  sessionId?: unknown;
  content?: unknown;
  messages?: unknown;
  mode?: unknown;
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
  | { incognito: true; messages: ChatMessage[]; mode: 'send' | 'continue' }
  | {
      incognito: false;
      sessionId: string | null;
      userTypedText: string;
      file: File | null;
      mode: ReplyMode;
    }
);

type ParseResult = { ok: true; parsed: ParsedRequest } | { ok: false; response: Response };

function badRequest(message: string): Response {
  return NextResponse.json({ status: 'error', message }, { status: 400 });
}

/** `mode` defaults to `send`; anything unrecognised is rejected rather than
 *  silently treated as a send, so a client/server drift is loud. */
function parseMode(value: unknown): ReplyMode | null {
  if (value === undefined || value === null || value === '') return 'send';
  return isReplyMode(value) ? value : null;
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
    const mode = parseMode(formData.get('mode'));
    // An attachment is new user content, so only the two modes that carry a
    // user message make sense with one.
    if (mode !== 'send' && mode !== 'edit') {
      return { ok: false, response: badRequest('Unknown request mode.') };
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
        mode,
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
  const mode = parseMode(body.mode);
  if (mode === null) return { ok: false, response: badRequest('Unknown request mode.') };

  if (body.incognito === true) {
    if (!isValidMessages(body.messages)) {
      return {
        ok: false,
        response: badRequest('messages must be a non-empty array of {role, content}.'),
      };
    }
    if (mode !== 'send' && mode !== 'continue') {
      return { ok: false, response: badRequest('Unknown request mode.') };
    }
    return { ok: true, parsed: { modelKey, incognito: true, messages: body.messages, mode } };
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null;
  return {
    ok: true,
    parsed: { modelKey, incognito: false, sessionId, userTypedText: content, file: null, mode },
  };
}

/** How the finished reply lands in `warden_messages` (see `reply-modes.ts`). */
type ReplyPersistence =
  | { kind: 'append' }
  | { kind: 'extend'; messageId: string }
  | { kind: 'replace'; messageId: string };

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
    /** Whether `sessionId` was just lazily created for *this* request
     *  (no `sessionId` in the original request body) rather than supplied
     *  by the client. Only a freshly-created session is safe to clean up
     *  below on a failed dispatch — an existing, client-supplied session
     *  may already hold prior history worth keeping even if this one send
     *  failed. */
    sessionWasCreated: boolean;
    providerId: string | null;
    model: string;
    /** The user turn this request adds, or `null` when it adds none
     *  (`continue`/`regenerate` act on turns already in the thread). */
    userTurn: { content: string } | null;
    reply: ReplyPersistence;
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
      // `captureAndPersist` has the whole reply; the client's stream is
      // held open (its `done` frame withheld) until that write lands, so a
      // client that re-reads the conversation the moment its stream ends
      // always finds the reply there.
      //
      // The promise is kept (rather than fired and forgotten) so the
      // cleanup path below can sequence itself after this write instead of
      // racing it — an immediate stream failure can otherwise reach the
      // capture callback before the insert has landed.
      const userMessageWrite: Promise<MessageView | null> = persist.userTurn
        ? appendMessage(persist.userId, persist.tenantId, persist.sessionId, {
            role: 'user',
            content: persist.userTurn.content,
            providerId: persist.providerId,
            model: persist.model,
          }).catch((error) => {
            console.error('[warden] failed to persist user message:', error);
            return null;
          })
        : Promise.resolve(null);

      response = captureAndPersist(response, {
        outputTokenCap: MAX_OUTPUT_TOKENS,
        onComplete: async ({ text, errorMessage, cancelled }) => {
          if (text) {
            // Also the cancelled case: the user pressed Stop, so what they
            // saw on screen is the reply — persisting exactly that keeps a
            // reload consistent with the conversation they were looking at.
            await persistReply(persist, text).catch((error) =>
              console.error('[warden] failed to persist assistant message:', error),
            );
            return;
          }
          // A stream that opened successfully but produced no content at all
          // (provider failed mid-stream, connection dropped, or the user
          // stopped it before the first token). If this request added a user
          // turn, it was already persisted above, so returning here would
          // strand it: the thread keeps a user turn with no reply, and the
          // *next* send hands the model two consecutive user messages. Clean
          // up instead — a session this request created goes entirely, and
          // otherwise just the stranded user turn does. `continue` and
          // `regenerate` added nothing, and their in-place write never ran,
          // so the thread is exactly as it was.
          if (!errorMessage && !cancelled) return;
          if (!persist.userTurn) return;
          await userMessageWrite
            .then((userMessage) => {
              if (persist.sessionWasCreated) {
                return deleteSession(persist.userId, persist.tenantId, persist.sessionId);
              }
              if (!userMessage) return undefined;
              return deleteMessage(
                persist.userId,
                persist.tenantId,
                persist.sessionId,
                userMessage.id,
              );
            })
            .catch((error) =>
              console.error('[warden] failed to clean up after an empty stream:', error),
            );
        },
      });
    }

    return response;
  }

  // The model call failed — a lazily-created session was committed *before*
  // this point, since its id had to exist for `getRecentMessagesForContext`'s
  // ownership check. Without this cleanup it's left behind forever: empty,
  // untitled (`deriveTitle()` only runs on a successful `appendMessage`),
  // and indistinguishable in the sidebar from a session about to get its
  // first message. A client-supplied session is never touched here — only
  // one this exact request created.
  if (persist?.sessionWasCreated) {
    await deleteSession(persist.userId, persist.tenantId, persist.sessionId).catch((error) => {
      console.error('[warden] failed to clean up an orphaned session after a failed send:', error);
    });
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

async function persistReply(
  persist: {
    userId: string;
    tenantId: string;
    sessionId: string;
    providerId: string | null;
    model: string;
    reply: ReplyPersistence;
  },
  text: string,
): Promise<void> {
  const { userId, tenantId, sessionId, providerId, model, reply } = persist;
  switch (reply.kind) {
    case 'append':
      await appendMessage(userId, tenantId, sessionId, {
        role: 'assistant',
        content: text,
        providerId,
        model,
      });
      return;
    case 'extend':
      await extendMessage(userId, tenantId, sessionId, reply.messageId, text);
      return;
    case 'replace':
      await replaceMessage(userId, tenantId, sessionId, reply.messageId, {
        content: text,
        providerId,
        model,
      });
      return;
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
    // Incognito is the one path where the client supplies the whole
    // transcript (the server keeps nothing to reconstruct it from), so its
    // size has to be bounded here. Only the *last* message used to be
    // length-checked, with no cap on how many messages could be sent or on
    // the total payload — an authenticated user could push arbitrarily
    // large bodies through, and Route Handlers apply no body-size limit of
    // their own. `limits.ts`: "enforced server-side, not left to the client."
    if (parsed.messages.length > MAX_RECENT_TURNS) {
      return badRequest(`Incognito conversations are limited to ${MAX_RECENT_TURNS} messages.`);
    }
    const totalChars = parsed.messages.reduce(
      (sum, message) => sum + (typeof message.content === 'string' ? message.content.length : 0),
      0,
    );
    if (totalChars > MAX_INPUT_CHARS * MAX_RECENT_TURNS) {
      return badRequest('This conversation is too long. Start a new incognito chat.');
    }
    const last = parsed.messages[parsed.messages.length - 1];
    if (parsed.mode === 'continue') {
      if (last?.role !== 'assistant') return badRequest('There is no reply to continue.');
    } else if (typeof last?.content === 'string' && last.content.length > MAX_INPUT_CHARS) {
      return badRequest(`Messages are limited to ${MAX_INPUT_CHARS} characters.`);
    }

    const selection = await resolveModelSelection(parsed.modelKey);
    if (selection.kind === 'invalid') return badRequest(selection.message);

    const messages: ChatMessage[] =
      parsed.mode === 'continue'
        ? [...parsed.messages, { role: 'user', content: CONTINUE_INSTRUCTION }]
        : parsed.messages;
    return dispatchAndRespond(selection, messages, null);
  }

  const addsUserTurn = parsed.mode === 'send' || parsed.mode === 'edit';
  if (addsUserTurn) {
    if (!parsed.userTypedText) return badRequest('A message is required.');
    if (parsed.userTypedText.length > MAX_INPUT_CHARS) {
      return badRequest(`Messages are limited to ${MAX_INPUT_CHARS} characters.`);
    }
  }
  // Every mode but `send` acts on turns that already exist, so it needs a
  // session to find them in — none of them may create one.
  if (parsed.mode !== 'send' && !parsed.sessionId) {
    return badRequest('There is no conversation to act on yet.');
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
  // (RFC 0063 §3/§10). `sessionWasCreated` lets `dispatchAndRespond` clean
  // this row back up if the model call below fails, so a failed send never
  // leaves an empty, untitled session behind in the sidebar.
  const sessionWasCreated = !parsed.sessionId;
  const sessionId =
    parsed.sessionId ?? (await createSession(session.user.id, session.user.tenantId)).id;

  let recent: MessageView[];
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

  const providerId = selection.kind === 'provider' ? selection.providerId : null;
  const model = selection.kind === 'provider' ? selection.model : 'local';
  const base = { userId: session.user.id, tenantId: session.user.tenantId, sessionId };
  const history = (turns: MessageView[]): ChatMessage[] =>
    turns.map((m) => ({ role: m.role, content: m.content }));
  const lastTurn = recent[recent.length - 1];

  switch (parsed.mode) {
    case 'continue': {
      if (lastTurn?.role !== 'assistant') return badRequest('There is no reply to continue.');
      return dispatchAndRespond(
        selection,
        [...history(recent), { role: 'user', content: CONTINUE_INSTRUCTION }],
        {
          ...base,
          sessionWasCreated: false,
          providerId,
          model,
          userTurn: null,
          reply: { kind: 'extend', messageId: lastTurn.id },
        },
      );
    }
    case 'regenerate': {
      if (lastTurn?.role !== 'assistant') return badRequest('There is no reply to regenerate.');
      // The old reply stays in the thread (and on the user's screen) until
      // the new one has fully streamed — `replaceMessage` runs on completion.
      return dispatchAndRespond(selection, history(recent.slice(0, -1)), {
        ...base,
        sessionWasCreated: false,
        providerId,
        model,
        userTurn: null,
        reply: { kind: 'replace', messageId: lastTurn.id },
      });
    }
    case 'edit': {
      // Drop the trailing reply (if the last user turn got one) and the
      // user turn itself, then proceed exactly like a send of the new text.
      let remaining = recent;
      if (lastTurn?.role === 'assistant') {
        await deleteMessage(base.userId, base.tenantId, sessionId, lastTurn.id);
        remaining = remaining.slice(0, -1);
      }
      const lastUser = remaining[remaining.length - 1];
      if (lastUser?.role !== 'user') return badRequest('There is no message to edit.');
      await deleteMessage(base.userId, base.tenantId, sessionId, lastUser.id);
      remaining = remaining.slice(0, -1);
      return dispatchAndRespond(
        selection,
        [...history(remaining), { role: 'user', content: contentForModel }],
        {
          ...base,
          sessionWasCreated: false,
          providerId,
          model,
          userTurn: { content: contentForPersistence },
          reply: { kind: 'append' },
        },
      );
    }
    case 'send':
      return dispatchAndRespond(
        selection,
        [...history(recent), { role: 'user', content: contentForModel }],
        {
          ...base,
          sessionWasCreated,
          providerId,
          model,
          userTurn: { content: contentForPersistence },
          reply: { kind: 'append' },
        },
      );
  }
}
