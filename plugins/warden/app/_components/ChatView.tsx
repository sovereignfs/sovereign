'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Message,
  MessageScroller,
  Select,
  Textarea,
  Toggle,
} from '@sovereignfs/ui';
import type { DiscoveredModel } from '../_lib/model-discovery';
import type { MessageView } from '../_lib/sessions';
import {
  classifyAttachmentType,
  describeDocumentPlaceholder,
  describeImageForHistory,
  MAX_ATTACHMENT_BYTES,
} from '../_lib/limits';
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
 * Warden's chat surface (RFC 0063, epic tasks 22.3-22.5). Persisted by
 * default — `initialMessages` (loaded server-side) seeds `persistedTurns`,
 * which the server keeps in sync via `/warden/api/chat`'s persisted request
 * shape (`{modelKey, content}` — just the new message; the server already
 * has the rest of the history).
 *
 * Incognito is a genuinely separate, always-empty-on-entry scratch context
 * (`incognitoTurns`), not a pause of the persisted thread — switching it on
 * always starts fresh, matching a browser's own incognito window. Nothing
 * about an incognito turn is ever sent in the persisted request shape.
 * Attachments are persisted-mode only — the attach control is disabled
 * while incognito is on, rather than teaching the incognito wire shape
 * to carry a file too.
 *
 * Explicitly no tool call, task handoff, or voice input anywhere in this
 * component or its dependencies. File attachment is user-supplied message
 * content (an image or document the user is asking about), not agentic
 * tool execution, so it doesn't relax that boundary — same for the
 * web-search toggle below, which is a disabled placeholder with no
 * request-time effect at all.
 */
export function ChatView({
  initialSessionId,
  initialMessages,
  models,
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

  const turns = incognito ? incognitoTurns : persistedTurns;
  const setTurns = incognito ? setIncognitoTurns : setPersistedTurns;

  function handleIncognitoToggle(next: boolean) {
    if (next) setIncognitoTurns([]); // always a fresh scratch context, never a resumed one
    setIncognito(next);
    setBanner(null);
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

    let response: Response;
    try {
      if (sentAttachment) {
        const formData = new FormData();
        formData.append('modelKey', modelKey);
        if (sessionId) formData.append('sessionId', sessionId);
        formData.append('content', content);
        formData.append('file', sentAttachment);
        response = await fetch('/warden/api/chat', { method: 'POST', body: formData });
      } else {
        const requestBody = incognito
          ? { modelKey, incognito: true, messages: nextTurns }
          : { modelKey, sessionId, content };
        response = await fetch('/warden/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
      }
    } catch {
      setPendingText(null);
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

    setPendingText(null);
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

  return (
    <div className={styles.chat}>
      <div className={styles.chatHeader}>
        <span className={styles.toggleLabel}>
          <Toggle
            checked={incognito}
            onChange={handleIncognitoToggle}
            aria-label="Incognito — don't save this conversation"
          />
          Incognito
        </span>
        <div className={styles.manageLinks}>
          <Link href="/warden/settings?tab=providers" className={styles.manageLink}>
            Manage providers
          </Link>
          <Link href="/warden/settings?tab=models" className={styles.manageLink}>
            Manage models
          </Link>
        </div>
      </div>
      <div className={styles.scrollArea}>
        <MessageScroller>
          {turns.length === 0 && pendingText === null && (
            <div className={styles.emptyState}>
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
                    <Link href="/warden/settings?tab=models">Manage models</Link>
                  ) : undefined
                }
              />
            </div>
          )}
          {turns.map((turn, index) => (
            <Message key={index} sender={turn.role}>
              {turn.content}
            </Message>
          ))}
          {pendingText !== null && (
            <Message sender="assistant" pending={pendingText === ''}>
              {pendingText || undefined}
            </Message>
          )}
        </MessageScroller>
      </div>
      {banner && (
        <p className={styles.banner} role="alert">
          {banner}
        </p>
      )}
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
            <span className={styles.toggleLabel} title="Web search isn’t available yet">
              <Toggle
                checked={false}
                onChange={() => {}}
                disabled
                aria-label="Web search (coming soon)"
              />
              <Icon name="search" size="sm" aria-hidden />
              Web search
              <Badge variant="mono" uppercase={false} size="sm">
                Soon
              </Badge>
            </span>
          </div>
          <div className={styles.composerToolbarEnd}>
            <Select
              value={modelKey}
              onChange={(event) => setModelKey(event.target.value)}
              aria-label="Model"
              size="sm"
              disabled={models.length === 0}
            >
              {models.length === 0 && (
                <option value="">
                  {allModelsHidden ? 'No models shown' : 'No model reachable'}
                </option>
              )}
              {models.map((model) => (
                <option key={model.key} value={model.key}>
                  {model.label}
                </option>
              ))}
            </Select>
            <Button
              type="submit"
              disabled={!input.trim() || !modelKey || state.kind === 'streaming'}
              loading={state.kind === 'streaming'}
            >
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
