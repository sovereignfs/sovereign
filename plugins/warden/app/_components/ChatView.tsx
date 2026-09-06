'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  Markdown,
  Message,
  MessageScroller,
  Textarea,
  Tooltip,
  useIsMobile,
} from '@sovereignfs/ui';
import type { DiscoveredModel } from '../_lib/model-discovery';
import type { MessageView } from '../_lib/sessions';
import {
  classifyAttachmentType,
  describeDocumentPlaceholder,
  describeImageForHistory,
  MAX_ATTACHMENT_BYTES,
} from '../_lib/limits';
import type { ReplyMode } from '../_lib/reply-modes';
import { clearSessionMessagesAction } from '../actions';
import { ModelPickerPopover, type ModelProviderInfo } from './ModelPickerPopover';
import styles from '../warden.module.css';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Epoch ms. Optional only for turns that pre-date this field. */
  createdAt?: number;
  /** Assistant turns only: the model that produced this reply, as shown
   *  under the bubble. `undefined` for a user turn. */
  modelLabel?: string;
  /** The model stopped at its output cap — this reply is cut off, not
   *  finished. Cleared once a `continue` has extended it to a real end. */
  truncated?: boolean;
}

interface ChatFrame {
  type: 'token' | 'done' | 'error' | 'truncated';
  text?: string;
  message?: string;
}

type ViewState = { kind: 'idle' } | { kind: 'streaming' } | { kind: 'blocked'; reason: string };

/** The turns "Edit" lifted out of the thread, held so Cancel can put them
 *  back exactly as they were. */
interface EditDraft {
  removed: ChatTurn[];
}

/** What a message row stores as `model` is the bare model id (`gpt-4o`)
 *  or the literal `'local'`; this is the short label shown under a reply. */
function modelLabelForMessage(message: MessageView): string {
  return message.providerId ? message.model : 'Local model';
}

function modelLabelForKey(models: DiscoveredModel[], key: string): string {
  if (key === 'local') return 'Local model';
  const separatorIndex = key.indexOf(':');
  if (separatorIndex !== -1) return key.slice(separatorIndex + 1);
  return models.find((model) => model.key === key)?.label ?? key;
}

function toChatTurn(message: MessageView): ChatTurn {
  return {
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    modelLabel: message.role === 'assistant' ? modelLabelForMessage(message) : undefined,
  };
}

/** Wire shape: the server only ever wants role + content. */
function toWireMessages(turns: ChatTurn[]): Array<{ role: ChatTurn['role']; content: string }> {
  return turns.map((turn) => ({ role: turn.role, content: turn.content }));
}

/** `HH:MM` for today, `d Mon, HH:MM` otherwise — in the viewer's locale. */
function formatTurnTime(createdAt: number): string {
  const date = new Date(createdAt);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * The muted line under a bubble: which model answered, and when. The time
 * is locale/timezone formatted, so the server's rendering can differ from
 * the browser's — `suppressHydrationWarning` on the one element whose text
 * is allowed to differ, rather than deferring the whole line to an effect.
 */
function TurnMeta({ turn }: { turn: ChatTurn }) {
  if (turn.createdAt === undefined && !turn.modelLabel) return null;
  return (
    <span className={styles.turnMeta}>
      {turn.modelLabel && <span>{turn.modelLabel}</span>}
      {turn.modelLabel && turn.createdAt !== undefined && <span aria-hidden> · </span>}
      {turn.createdAt !== undefined && (
        <time dateTime={new Date(turn.createdAt).toISOString()} suppressHydrationWarning>
          {formatTurnTime(turn.createdAt)}
        </time>
      )}
    </span>
  );
}

/**
 * Copy an assistant reply to the clipboard — table stakes for a chat
 * assistant, and `Message` already has an `actions` slot documented for
 * exactly this. Confirms inline for a moment rather than firing a toast,
 * which would be a lot of ceremony for a per-message action.
 *
 * `navigator.clipboard` is unavailable on an insecure origin and can be
 * denied by permissions policy, so the button hides itself rather than
 * offering an action that would silently do nothing.
 */
function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [available, setAvailable] = useState(false);

  // Read in an effect, never during render — a browser global in a
  // `useState` initializer is a hydration mismatch.
  useEffect(() => {
    setAvailable(typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!available) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={copied ? 'Copied' : 'Copy this reply'}
      onClick={() => {
        void navigator.clipboard.writeText(content).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size="sm" aria-hidden />
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/**
 * Warden's chat surface (RFC 0063, epic tasks 22.3-22.5, 22.11). Persisted
 * by default — `initialMessages` (loaded server-side) seeds
 * `persistedTurns`, which the server keeps in sync via
 * `/warden/api/chat`'s persisted request shape (`{modelKey, content}` —
 * just the new message; the server already has the rest of the history).
 *
 * Incognito is a genuinely separate, always-empty-on-entry scratch context
 * (`incognitoTurns`), not a pause of the persisted thread — switching it on
 * always starts fresh, matching a browser's own incognito window. Nothing
 * about an incognito turn is ever sent in the persisted request shape.
 * Attachments are persisted-mode only — the attach control is disabled
 * while incognito is on, rather than teaching the incognito wire shape
 * to carry a file too.
 *
 * Every request goes through `run(mode)` (`reply-modes.ts`): a plain send,
 * a `continue` for a reply cut off at the output cap (streams into the
 * existing bubble), a `regenerate` of the last reply (the old one stays on
 * screen and on disk until the new one has fully arrived), or an `edit` of
 * the last user message (lifted into the composer; Cancel puts it back).
 * In incognito the client owns the transcript, so it trims it itself for
 * regenerate/edit and sends the result as an ordinary send.
 *
 * The composer is centered in the main column for a session with no
 * messages yet, and docks to the bottom the instant the first message is
 * sent (RFC 0063 §12) — keyed off the same `turns.length === 0` condition
 * the empty state already used, not new position-tracking logic, since
 * `run()` already appends the user's turn optimistically and
 * synchronously before the network request starts.
 *
 * Explicitly no tool call, task handoff, or voice input anywhere in this
 * component or its dependencies. File attachment is user-supplied message
 * content (an image or document the user is asking about), not agentic
 * tool execution, so it doesn't relax that boundary — same reasoning that
 * kept the (now-removed) web-search toggle a disabled placeholder with no
 * request-time effect while it existed.
 */
export function ChatView({
  initialSessionId,
  initialMessages,
  models,
  providers,
  defaultModelKey,
  allModelsHidden = false,
}: {
  /** Server-resolved active session — the sidebar's selected row
   *  (`?session=`), the most recently active one if none is selected, or
   *  `null` for a brand-new user with none yet (RFC 0063 §10, epic tasks
   *  22.8/22.10). */
  initialSessionId: string | null;
  initialMessages: MessageView[];
  models: DiscoveredModel[];
  /** Provider id/label pairs for the model picker's grouping (RFC 0063
   *  §12, epic task 22.11) — a stripped-down view of `discoverModels()`'s
   *  own `providers` list; the composer needs labels to group by, not the
   *  full reachability/error detail `ProvidersView`/`ModelsView` show. */
  providers: ModelProviderInfo[];
  defaultModelKey: string;
  /** True when at least one model was discovered but every one of them is
   *  hidden by this user's own visibility settings — distinct from "nothing
   *  reachable at all," which needs a different message. */
  allModelsHidden?: boolean;
}) {
  const router = useRouter();
  // On a phone the on-screen keyboard's Enter is how you make a new line;
  // Send is a button right there. On a desktop keyboard Enter sends and
  // Shift+Enter breaks the line, as every chat client does. Viewport width
  // stands in for "has a soft keyboard" — the design system's canonical
  // breakpoint, not a plugin-local pointer heuristic.
  const isMobile = useIsMobile();
  // Persisted-mode only — incognito never references a session (RFC 0063
  // §6/§10). Updated from the response's `x-warden-session-id` header the
  // first time a brand-new session is lazily created on send.
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [persistedTurns, setPersistedTurns] = useState<ChatTurn[]>(() =>
    initialMessages.map(toChatTurn),
  );
  const [incognitoTurns, setIncognitoTurns] = useState<ChatTurn[]>([]);
  const [incognito, setIncognito] = useState(false);
  const [modelKey, setModelKey] = useState(defaultModelKey);
  const [input, setInput] = useState('');
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [state, setState] = useState<ViewState>({ kind: 'idle' });
  const [banner, setBanner] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearPending, setClearPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Looked up by id rather than held in a ref: `Textarea` owns its own ref
  // for `autoGrow` and does not merge an external one — same approach
  // `ModelPickerPopover` takes to hand focus back to its trigger.
  const composerId = useId();
  /** The in-flight request, so the user can stop a long reply — and so
   *  navigating away doesn't leave a stream running against an unmounted
   *  component. */
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  function stopStreaming() {
    abortRef.current?.abort();
  }

  const turns = incognito ? incognitoTurns : persistedTurns;
  const setTurns = incognito ? setIncognitoTurns : setPersistedTurns;

  function handleIncognitoToggle(next: boolean) {
    if (next) setIncognitoTurns([]); // always a fresh scratch context, never a resumed one
    setIncognito(next);
    setBanner(null);
    // An edit in progress belongs to the thread being left; drop it rather
    // than carrying a persisted-mode draft into the scratch context (or
    // vice versa). The turns it lifted out stay lifted on that side — the
    // user asked to change them — and the composer is cleared with it.
    if (editDraft) {
      setEditDraft(null);
      setInput('');
    }
    // Attachments are unavailable in incognito (the attach control is
    // disabled below), but the control only blocks *starting* a new
    // attachment — one staged before the toggle would otherwise survive it,
    // and `run()` routes any request carrying a file down the multipart
    // path, which is the persisted one. That combination silently wrote the
    // message *and* the full extracted document text to the database while
    // the UI promised nothing was being saved.
    clearAttachment();
  }

  function clearAttachment() {
    setAttachment(null);
    setAttachmentError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError(
        `Attachments are limited to ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
      );
      return;
    }
    const kind = classifyAttachmentType(file.type, file.name);
    if (!kind) {
      setAttachmentError('That file type isn’t supported. Try an image, a PDF, or a text file.');
      return;
    }
    if (kind === 'image' && modelKey === 'local') {
      setAttachmentError(
        'The local model is text-only and doesn’t support images. Choose a different model first.',
      );
      return;
    }

    setAttachmentError(null);
    setAttachment(file);
  }

  /** Lifts the last user message (and its reply, if any) out of the thread
   *  and into the composer. Nothing is sent or deleted until Send. */
  function startEdit() {
    if (state.kind === 'streaming' || editDraft) return;
    const last = turns[turns.length - 1];
    const secondLast = turns[turns.length - 2];
    const removed =
      last?.role === 'user'
        ? [last]
        : last?.role === 'assistant' && secondLast?.role === 'user'
          ? [secondLast, last]
          : [];
    const userTurn = removed[0];
    if (!userTurn) return;
    setTurns((prev) => prev.slice(0, prev.length - removed.length));
    setEditDraft({ removed });
    setInput(userTurn.content);
    setBanner(null);
    document.getElementById(composerId)?.focus();
  }

  function cancelEdit() {
    if (!editDraft) return;
    setTurns((prev) => [...prev, ...editDraft.removed]);
    setEditDraft(null);
    setInput('');
  }

  async function run(requestedMode: ReplyMode) {
    if (!modelKey || state.kind === 'streaming') return;
    // Incognito's transcript is client-owned: regenerate/edit become a
    // trimmed transcript sent as an ordinary send (the trim for `edit`
    // already happened in `startEdit`), and only `continue` needs the server
    // to do something different.
    const mode: ReplyMode = incognito && requestedMode !== 'continue' ? 'send' : requestedMode;
    const addsUserTurn = requestedMode === 'send' || requestedMode === 'edit';
    const content = input.trim();
    if (addsUserTurn && !content) return; // a caption is required for every send, attachment or not

    let baseTurns = turns;
    // Regenerate: the old reply leaves the screen now, but is kept so a
    // failed attempt can put it straight back — the server likewise only
    // overwrites it once the new reply has fully streamed.
    let removedReply: ChatTurn | null = null;
    if (requestedMode === 'regenerate') {
      const last = baseTurns[baseTurns.length - 1];
      if (last?.role !== 'assistant') return;
      removedReply = last;
      baseTurns = baseTurns.slice(0, -1);
    }
    if (requestedMode === 'continue' && baseTurns[baseTurns.length - 1]?.role !== 'assistant') {
      return;
    }

    const hadPriorConversation = baseTurns.length > 0;
    const optimisticContent = attachment
      ? attachment.type.startsWith('image/')
        ? describeImageForHistory(content, attachment.name)
        : describeDocumentPlaceholder(content, attachment.name)
      : content;
    const nextTurns = addsUserTurn
      ? [...baseTurns, { role: 'user' as const, content: optimisticContent, createdAt: Date.now() }]
      : baseTurns;
    // `continue` streams into the existing last bubble rather than opening a
    // new pending one — the continuation *is* the rest of that reply.
    const streamIntoLast = requestedMode === 'continue';
    const continuedBase = streamIntoLast ? (baseTurns[baseTurns.length - 1]?.content ?? '') : '';

    setTurns(nextTurns);
    if (addsUserTurn) {
      setInput('');
      setEditDraft(null);
    }
    setBanner(null);
    if (!streamIntoLast) setPendingText('');
    setState({ kind: 'streaming' });
    const sentAttachment = addsUserTurn ? attachment : null;
    if (addsUserTurn) clearAttachment();

    const controller = new AbortController();
    abortRef.current = controller;

    function restoreOnFailure() {
      if (removedReply) setTurns((prev) => [...prev, removedReply as ChatTurn]);
    }

    let response: Response;
    try {
      if (sentAttachment) {
        const formData = new FormData();
        formData.append('modelKey', modelKey);
        if (sessionId) formData.append('sessionId', sessionId);
        formData.append('content', content);
        formData.append('file', sentAttachment);
        if (mode !== 'send') formData.append('mode', mode);
        // Defense in depth behind `handleIncognitoToggle`'s `clearAttachment()`:
        // if an attachment ever reaches this branch while incognito is on, the
        // route's own guard rejects it rather than silently persisting it.
        // Only appended when actually incognito — the route tests this field
        // for truthiness, so the *string* 'false' would reject every ordinary
        // attachment send.
        if (incognito) formData.append('incognito', 'true');
        response = await fetch('/warden/api/chat', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
      } else {
        const requestBody = incognito
          ? {
              modelKey,
              incognito: true,
              messages: toWireMessages(nextTurns),
              ...(mode === 'continue' ? { mode } : {}),
            }
          : {
              modelKey,
              sessionId,
              ...(mode !== 'send' ? { mode } : {}),
              ...(addsUserTurn ? { content } : {}),
            };
        response = await fetch('/warden/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      }
    } catch {
      setPendingText(null);
      restoreOnFailure();
      // A cancel is the user getting what they asked for, not a failure —
      // no banner, and never the blocking "Warden is unavailable" state.
      if (controller.signal.aborted) {
        setState({ kind: 'idle' });
        return;
      }
      failRequest(hadPriorConversation, 'Warden could not reach its chat engine.');
      return;
    }

    if (response.status !== 200) {
      const body: { message?: string } = await response.json().catch(() => ({}));
      setPendingText(null);
      restoreOnFailure();
      failRequest(hadPriorConversation, body.message ?? 'Warden is unavailable right now.');
      return;
    }

    let createdSessionThisSend = false;
    if (!incognito) {
      const resolvedSessionId = response.headers.get('x-warden-session-id');
      // Only a brand-new session's first send changes this — an existing
      // session's id is already in the URL, so there is nothing to sync.
      if (resolvedSessionId && resolvedSessionId !== sessionId) {
        setSessionId(resolvedSessionId);
        createdSessionThisSend = true;
        // The native history API, not `router.replace()`. Next.js syncs its
        // router state (`usePathname`/`useSearchParams`) to a `replaceState`
        // without fetching or re-rendering any route segment — which is the
        // point: this send started on `/warden/new` (a different page
        // segment from `/warden`), or on `/warden` with a `key` of `'new'`,
        // so a real navigation to `/warden?session=<id>` remounted this
        // component the moment the new segment arrived, mid-stream. Its
        // unmount effect aborted the fetch and the fresh instance seeded
        // from the database, which held only the user's turn — the first
        // reply of every new chat vanished until a reload. `replaceState`
        // (not `pushState`) so this doesn't stack a history entry for what
        // the user experiences as "still the same conversation."
        window.history.replaceState(null, '', `/warden?session=${resolvedSessionId}`);
      }
    }

    const reader = response.body?.getReader();
    if (!reader) {
      setPendingText(null);
      restoreOnFailure();
      failRequest(hadPriorConversation, 'Warden sent an empty response.');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let streamError: string | null = null;
    let truncated = false;
    const replyModelLabel = modelLabelForKey(models, modelKey);

    function showStreamed(streamed: string) {
      if (streamIntoLast) {
        setTurns((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          return [...prev.slice(0, -1), { ...last, content: continuedBase + streamed }];
        });
      } else {
        setPendingText(streamed);
      }
    }

    // `reader.read()` rejects on a dropped connection, a server crash
    // mid-stream, a proxy timeout, or the provider-side request deadline
    // destroying the socket. Without this the rejection escaped `run()` —
    // which every caller invokes as `void run()` — so it surfaced as an
    // unhandled rejection and, far worse, skipped the state reset below:
    // `state.kind` stayed `'streaming'` forever, leaving the composer,
    // Send button and attach control permanently disabled with a ghost
    // pending bubble on screen and no way back except a page reload.
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
          let frame: ChatFrame;
          try {
            frame = JSON.parse(payload);
          } catch {
            continue;
          }
          if (frame.type === 'token' && frame.text) {
            text += frame.text;
            showStreamed(text);
          } else if (frame.type === 'error') {
            streamError = frame.message ?? 'The response was interrupted.';
          } else if (frame.type === 'truncated') {
            truncated = true;
          }
        }
      }
    } catch {
      // Same distinction as the request-phase catch above: a deliberate
      // stop keeps whatever streamed so far, with no error banner.
      if (!controller.signal.aborted) {
        streamError = streamError ?? 'The response was interrupted.';
      }
    } finally {
      setPendingText(null);
      // Whatever arrived before the failure is still worth keeping — a
      // partial answer beats silently dropping it — but it is always
      // accompanied by the banner below, so it is never mistaken for a
      // complete reply.
      if (streamIntoLast) {
        setTurns((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          return [
            ...prev.slice(0, -1),
            // A continuation that itself got cut off stays flagged; one that
            // ran to a real end clears the flag. A continuation that produced
            // nothing leaves the reply as it was, still flagged.
            { ...last, content: continuedBase + text, truncated: text ? truncated : true },
          ];
        });
      } else if (text) {
        setTurns((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: text,
            createdAt: Date.now(),
            modelLabel: replyModelLabel,
            truncated,
          },
        ]);
      } else if (removedReply) {
        // Regenerate produced nothing (an error, or Stop before the first
        // token) — the server has not touched the original, so neither do we.
        restoreOnFailure();
      }
      if (streamError) {
        setBanner(
          streamError === 'timeout' ? 'Warden took too long to respond. Try again.' : streamError,
        );
      }
      setState({ kind: 'idle' });
      // The sidebar lives in `(chat)/layout.tsx`, and a layout is not
      // re-run for a navigation within the routes it wraps — so without
      // this the session just created would be missing from the list until
      // something else happened to refresh it. Deferred to *after* the
      // stream has ended (see the `replaceState` above for why it must not
      // run mid-stream): the server withholds the stream's `done` frame
      // until the reply is persisted, so the refresh always reads back both
      // turns. The URL now names `/warden?session=<id>`, so the refresh
      // also swaps this `/warden/new` segment for the ordinary chat page —
      // whose server-derived session model matches what was just used, so
      // the swap changes nothing on screen.
      if (createdSessionThisSend) router.refresh();
    }
  }

  function failRequest(hadPriorConversation: boolean, message: string) {
    if (hadPriorConversation) {
      setState({ kind: 'idle' });
      setBanner(message);
    } else {
      setState({ kind: 'blocked', reason: message });
    }
  }

  /**
   * "Clear conversation": every message goes, the session (title, pin,
   * sidebar row) stays. Lives here rather than in the sidebar's row menu
   * because this component seeds its turns from props once, on mount — a
   * clear triggered elsewhere plus a `router.refresh()` would leave the old
   * turns on screen. Here it can empty the on-screen thread directly.
   * Incognito's scratch context is client-only, so clearing it needs no
   * server call at all.
   */
  function clearConversation() {
    if (incognito) {
      setIncognitoTurns([]);
      setConfirmClear(false);
      return;
    }
    if (!sessionId) {
      setConfirmClear(false);
      return;
    }
    setClearPending(true);
    void clearSessionMessagesAction(sessionId).then((result) => {
      setClearPending(false);
      setConfirmClear(false);
      if (!result.ok) {
        setBanner(result.error);
        return;
      }
      setPersistedTurns([]);
      setEditDraft(null);
      setInput('');
      setBanner(null);
    });
  }

  function submit() {
    void run(editDraft ? 'edit' : 'send');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !isMobile) {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape' && editDraft) {
      event.preventDefault();
      cancelEdit();
    }
  }

  if (state.kind === 'blocked') {
    return (
      <div className={styles.emptyState}>
        <EmptyState
          icon="alert-triangle"
          heading="Warden is unavailable"
          description={state.reason}
          action={
            <Button onClick={() => setState({ kind: 'idle' })} variant="secondary">
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const isEmpty = turns.length === 0;
  const isStreaming = state.kind === 'streaming';
  const modelPlaceholder = allModelsHidden ? 'No models shown' : 'No model reachable';
  const lastIndex = turns.length - 1;
  // Edit is offered on the last user message only (see `reply-modes.ts`),
  // and only while there is nothing lifted out already.
  const editableIndex =
    editDraft || isStreaming
      ? -1
      : turns[lastIndex]?.role === 'user'
        ? lastIndex
        : turns[lastIndex]?.role === 'assistant' && turns[lastIndex - 1]?.role === 'user'
          ? lastIndex - 1
          : -1;

  function actionsFor(turn: ChatTurn, index: number) {
    const isLast = index === lastIndex;
    if (turn.role === 'assistant') {
      return (
        <>
          <TurnMeta turn={turn} />
          <CopyMessageButton content={turn.content} />
          {isLast && !isStreaming && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Regenerate this reply"
              onClick={() => void run('regenerate')}
            >
              <Icon name="refresh-cw" size="sm" aria-hidden />
              Regenerate
            </Button>
          )}
          {isLast && turn.truncated && (
            <span className={styles.truncatedNote} role="status">
              <Icon name="alert-triangle" size="sm" aria-hidden />
              <span>Cut off at the model&rsquo;s length limit.</span>
              {!isStreaming && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Continue this reply"
                  onClick={() => void run('continue')}
                >
                  Continue
                </Button>
              )}
            </span>
          )}
        </>
      );
    }
    if (turn.createdAt === undefined && index !== editableIndex) return undefined;
    return (
      <>
        <TurnMeta turn={turn} />
        {index === editableIndex && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Edit this message"
            onClick={startEdit}
          >
            <Icon name="pencil" size="sm" aria-hidden />
            Edit
          </Button>
        )}
      </>
    );
  }

  const composer = (
    <form className={styles.composer} onSubmit={handleSubmit}>
      {editDraft && (
        <div className={styles.editBar} role="status">
          <Icon name="pencil" size="sm" aria-hidden />
          <span className={styles.editBarText}>
            Editing your last message — sending replaces it and its reply.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
            Cancel
          </Button>
        </div>
      )}
      {attachment && (
        <div className={styles.attachmentChip}>
          <Icon name="file-text" size="sm" aria-hidden />
          <span>{attachment.name}</span>
          <button
            type="button"
            className={styles.attachmentChipRemove}
            onClick={clearAttachment}
            aria-label="Remove attachment"
          >
            <Icon name="x" size="xs" aria-hidden />
          </button>
        </div>
      )}
      {attachmentError && (
        <p className={styles.attachmentError} role="alert">
          {attachmentError}
        </p>
      )}
      <Textarea
        id={composerId}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message Warden…"
        // One line to start and grows with the text (capped in CSS, then
        // scrolls) — a fixed two rows was either wasted space or a
        // letterbox onto a long message, depending on what was typed.
        rows={1}
        autoGrow
        disabled={isStreaming}
        aria-label="Message Warden"
        className={styles.composerTextarea}
      />
      <div className={styles.composerToolbar}>
        <div className={styles.composerToolbarStart}>
          <input
            ref={fileInputRef}
            type="file"
            className={styles.hiddenFileInput}
            accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,.md,.txt"
            onChange={handleFileChange}
            disabled={incognito}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Attach a file"
            disabled={incognito || isStreaming}
            title={incognito ? 'Attachments are not available in incognito mode' : undefined}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="plus" size="sm" aria-hidden />
          </Button>
        </div>
        <div className={styles.composerToolbarEnd}>
          <ModelPickerPopover
            models={models}
            providers={providers}
            value={modelKey}
            onChange={setModelKey}
            placeholder={modelPlaceholder}
            disabled={models.length === 0}
          />
          {/* Replaces Send while a reply is streaming rather than sitting
              beside it — the two are never usable at the same time, and a
              long reply with no way to stop it is the more common
              frustration than a slow Send button. */}
          {isStreaming ? (
            <Button
              type="button"
              variant="secondary"
              className={styles.composerSend}
              onClick={stopStreaming}
            >
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              className={styles.composerSend}
              disabled={!input.trim() || !modelKey}
            >
              Send
            </Button>
          )}
        </div>
      </div>
    </form>
  );

  return (
    /*
      Full-width surface wrapping the 720px `.chat` column. It exists so the
      incognito tint and status bar span the whole main column rather than
      just the reading column — a tint stopping at 720px reads as a floating
      panel, not as "this whole mode is different".
    */
    <div
      className={incognito ? `${styles.chatSurface} ${styles.chatIncognito}` : styles.chatSurface}
    >
      {/* Top-right, aligned with the shell's own top-left controls (both
          resolve against `.mainColumn`). Absolutely positioned and always
          rendered, so toggling incognito never reflows the chat column or
          disturbs the centered empty state. */}
      <div className={styles.chatTopBar}>
        {!isEmpty && (
          <Tooltip content="Clear this conversation">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear this conversation"
              disabled={isStreaming}
              onClick={() => setConfirmClear(true)}
            >
              <Icon name="trash-2" size="sm" aria-hidden />
            </Button>
          </Tooltip>
        )}
        <Tooltip content={incognito ? 'Turn off incognito' : 'Turn on incognito'}>
          <Button
            type="button"
            /* Solid (not the bordered `secondary`) while on — this is a
               sticky mode, not a momentary press, so it should read as
               filled-in/selected at a glance. */
            variant={incognito ? 'primary' : 'ghost'}
            size="sm"
            aria-pressed={incognito}
            aria-label="Incognito — don't save this conversation"
            onClick={() => handleIncognitoToggle(!incognito)}
          >
            <Icon name="hat-glasses" size="sm" aria-hidden />
          </Button>
        </Tooltip>
      </div>
      {/*
        The mode is destructive by design (nothing survives leaving it), so
        it gets a standing reminder rather than only a one-time empty state —
        that empty state disappears the moment the first message is sent,
        which is exactly when forgetting the mode starts to matter.
        `role="status"` announces the change without stealing focus.
      */}
      {incognito && (
        <div className={styles.incognitoBar} role="status">
          <Icon name="hat-glasses" size="sm" aria-hidden />
          <span>Incognito — this chat isn&rsquo;t saved.</span>
        </div>
      )}
      <div className={isEmpty ? `${styles.chat} ${styles.chatCentered}` : styles.chat}>
        {isEmpty ? (
          <EmptyState
            heading={
              incognito
                ? 'Incognito chat'
                : allModelsHidden
                  ? 'Turn on a model to get started'
                  : 'Ask Warden anything'
            }
            description={
              incognito
                ? 'Nothing in this conversation is saved. Turning incognito off (or leaving) discards it for good.'
                : allModelsHidden
                  ? "Provider models stay off until you choose which ones to use — that's what keeps a big catalog from cluttering this list."
                  : 'Chat with the model you selected below — saved to this conversation by default.'
            }
            action={
              allModelsHidden && !incognito ? (
                <Link href="/warden/models">
                  <Button variant="secondary" size="sm">
                    Manage models
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className={styles.scrollArea}>
            <MessageScroller>
              {/* The reading column lives inside the scroller, not around
                  it, so the scrollbar sits at the edge of the window rather
                  than alongside the text. */}
              <div className={styles.messageColumn}>
                {turns.map((turn, index) => (
                  <Message key={index} sender={turn.role} actions={actionsFor(turn, index)}>
                    {/*
                  Assistant replies are markdown — every model emits it, and
                  rendering them as plain text put literal `**bold**`,
                  `1.` and ``` fences on screen. A user's own turn is
                  rendered verbatim: they typed text, not markup, and
                  silently reformatting it would be wrong (and would let a
                  pasted snippet restyle their own message).
                */}
                    {turn.role === 'assistant' ? <Markdown content={turn.content} /> : turn.content}
                  </Message>
                ))}
                {pendingText !== null && (
                  <Message sender="assistant" pending={pendingText === ''}>
                    {pendingText ? <Markdown content={pendingText} /> : undefined}
                  </Message>
                )}
              </div>
            </MessageScroller>
          </div>
        )}
        {banner && (
          <p className={styles.banner} role="alert">
            {banner}
          </p>
        )}
        {composer}
      </div>
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear this conversation?"
        message={
          incognito
            ? 'Every message in this incognito chat is discarded.'
            : 'Every message is deleted permanently. The chat itself stays in your sidebar, with its title and pin.'
        }
        confirmLabel={clearPending ? 'Clearing…' : 'Clear'}
        destructive
        pending={clearPending}
        onConfirm={clearConversation}
      />
    </div>
  );
}
