'use client';

import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  Button,
  EmptyState,
  Message,
  MessageScroller,
  Select,
  Textarea,
  Toggle,
} from '@sovereignfs/ui';
import type { DiscoveredModel } from '../_lib/model-discovery';
import type { MessageView } from '../_lib/conversations';
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
 *
 * Explicitly no tool call, task handoff, floating button, or voice input
 * anywhere in this component or its dependencies.
 */
export function ChatView({
  initialMessages,
  models,
  defaultModelKey,
}: {
  initialMessages: MessageView[];
  models: DiscoveredModel[];
  defaultModelKey: string;
}) {
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

  const turns = incognito ? incognitoTurns : persistedTurns;
  const setTurns = incognito ? setIncognitoTurns : setPersistedTurns;

  function handleIncognitoToggle(next: boolean) {
    if (next) setIncognitoTurns([]); // always a fresh scratch context, never a resumed one
    setIncognito(next);
    setBanner(null);
  }

  async function send() {
    const content = input.trim();
    if (!content || !modelKey || state.kind === 'streaming') return;

    const hadPriorConversation = turns.length > 0;
    const nextTurns = [...turns, { role: 'user' as const, content }];
    setTurns(nextTurns);
    setInput('');
    setBanner(null);
    setPendingText('');
    setState({ kind: 'streaming' });

    const requestBody = incognito
      ? { modelKey, incognito: true, messages: nextTurns }
      : { modelKey, content };

    let response: Response;
    try {
      response = await fetch('/warden/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
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
        <div className={styles.chatHeaderControls}>
          <Select
            value={modelKey}
            onChange={(event) => setModelKey(event.target.value)}
            aria-label="Model"
            size="sm"
            disabled={models.length === 0}
          >
            {models.length === 0 && <option value="">No model reachable</option>}
            {models.map((model) => (
              <option key={model.key} value={model.key}>
                {model.label}
              </option>
            ))}
          </Select>
          <span className={styles.incognitoLabel}>
            <Toggle
              checked={incognito}
              onChange={handleIncognitoToggle}
              aria-label="Incognito — don't save this conversation"
            />
            Incognito
          </span>
        </div>
        <Link href="/warden/providers" className={styles.manageProvidersLink}>
          Manage providers
        </Link>
      </div>
      <div className={styles.scrollArea}>
        <MessageScroller>
          {turns.length === 0 && pendingText === null && (
            <div className={styles.emptyState}>
              <EmptyState
                heading={incognito ? 'Incognito chat' : 'Ask Warden anything'}
                description={
                  incognito
                    ? 'Nothing in this conversation is saved. Turning incognito off (or leaving) discards it for good.'
                    : 'Chat with the model you selected above — saved to this conversation by default.'
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
      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Warden…"
          rows={2}
          disabled={state.kind === 'streaming'}
          aria-label="Message Warden"
        />
        <Button
          type="submit"
          disabled={!input.trim() || !modelKey || state.kind === 'streaming'}
          loading={state.kind === 'streaming'}
        >
          Send
        </Button>
      </form>
    </div>
  );
}
