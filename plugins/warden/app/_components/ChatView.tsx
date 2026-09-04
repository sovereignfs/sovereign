'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  EmptyState,
  Icon,
  Markdown,
  Message,
  MessageScroller,
  Textarea,
  Tooltip,
} from '@sovereignfs/ui';
import type { DiscoveredModel } from '../_lib/model-discovery';
import type { MessageView } from '../_lib/sessions';
import {
  classifyAttachmentType,
  describeDocumentPlaceholder,
  describeImageForHistory,
  MAX_ATTACHMENT_BYTES,
} from '../_lib/limits';
import { ModelPickerPopover, type ModelProviderInfo } from './ModelPickerPopover';
import styles from '../warden.module.css';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatFrame {
  type: 'token' | 'done' | 'error';
  text?: string;
  message?: string;
}

type ViewState = { kind: 'idle' } | { kind: 'streaming' } | { kind: 'blocked'; reason: string };

function toChatTurn(message: MessageView): ChatTurn {
  return { role: message.role, content: message.content };
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
 * The composer is centered in the main column for a session with no
 * messages yet, and docks to the bottom the instant the first message is
 * sent (RFC 0063 §12) — keyed off the same `turns.length === 0` condition
 * the empty state already used, not new position-tracking logic, since
 * `send()` already appends the user's turn optimistically and
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
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    // Attachments are unavailable in incognito (the attach control is
    // disabled below), but the control only blocks *starting* a new
    // attachment — one staged before the toggle would otherwise survive it,
    // and `send()` routes any request carrying a file down the multipart
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

  async function send() {
    const content = input.trim();
    if ((!content && !attachment) || !modelKey || state.kind === 'streaming') return;
    if (!content) return; // a caption is required for every send, attachment or not

    const hadPriorConversation = turns.length > 0;
    const optimisticContent = attachment
      ? attachment.type.startsWith('image/')
        ? describeImageForHistory(content, attachment.name)
        : describeDocumentPlaceholder(content, attachment.name)
      : content;
    const nextTurns = [...turns, { role: 'user' as const, content: optimisticContent }];
    setTurns(nextTurns);
    setInput('');
    setBanner(null);
    setPendingText('');
    setState({ kind: 'streaming' });
    const sentAttachment = attachment;
    clearAttachment();

    const controller = new AbortController();
    abortRef.current = controller;

    let response: Response;
    try {
      if (sentAttachment) {
        const formData = new FormData();
        formData.append('modelKey', modelKey);
        if (sessionId) formData.append('sessionId', sessionId);
        formData.append('content', content);
        formData.append('file', sentAttachment);
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
          ? { modelKey, incognito: true, messages: nextTurns }
          : { modelKey, sessionId, content };
        response = await fetch('/warden/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      }
    } catch {
      setPendingText(null);
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
      failRequest(hadPriorConversation, body.message ?? 'Warden is unavailable right now.');
      return;
    }

    if (!incognito) {
      const resolvedSessionId = response.headers.get('x-warden-session-id');
      // Only a brand-new session's first send changes this — an existing
      // session's id is already in the URL, so there is nothing to sync.
      // `replace` (not `push`) so this doesn't stack a history entry for
      // what the user experiences as "still the same conversation."
      if (resolvedSessionId && resolvedSessionId !== sessionId) {
        setSessionId(resolvedSessionId);
        router.replace(`/warden?session=${resolvedSessionId}`);
        // The sidebar lives in `(chat)/layout.tsx`, and a layout is not
        // re-run for a navigation within the routes it wraps — so without
        // this the session just created would be missing from the list
        // until something else happened to refresh it. `refresh()`
        // re-fetches server components while preserving client state, so
        // the conversation on screen is unaffected.
        router.refresh();
      }
    }

    const reader = response.body?.getReader();
    if (!reader) {
      setPendingText(null);
      failRequest(hadPriorConversation, 'Warden sent an empty response.');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let streamError: string | null = null;

    // `reader.read()` rejects on a dropped connection, a server crash
    // mid-stream, a proxy timeout, or the provider-side request deadline
    // destroying the socket. Without this the rejection escaped `send()` —
    // which every caller invokes as `void send()` — so it surfaced as an
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
            setPendingText(text);
          } else if (frame.type === 'error') {
            streamError = frame.message ?? 'The response was interrupted.';
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
      if (text) {
        setTurns((prev) => [...prev, { role: 'assistant', content: text }]);
      }
      if (streamError) {
        setBanner(
          streamError === 'timeout' ? 'Warden took too long to respond. Try again.' : streamError,
        );
      }
      setState({ kind: 'idle' });
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
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
  const modelPlaceholder = allModelsHidden ? 'No models shown' : 'No model reachable';

  const composer = (
    <form className={styles.composer} onSubmit={handleSubmit}>
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
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message Warden…"
        rows={2}
        disabled={state.kind === 'streaming'}
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
            disabled={incognito || state.kind === 'streaming'}
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
          {state.kind === 'streaming' ? (
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
                  <Message
                    key={index}
                    sender={turn.role}
                    actions={
                      turn.role === 'assistant' ? (
                        <CopyMessageButton content={turn.content} />
                      ) : undefined
                    }
                  >
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
    </div>
  );
}
