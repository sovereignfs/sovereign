'use client';

import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Button, EmptyState, Message, MessageScroller, Textarea } from '@sovereignfs/ui';
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

/**
 * Warden's chat surface (RFC 0063, epic task 22.3). Ephemeral by design —
 * `turns` is plain component state, lost on refresh, no persistence
 * anywhere. Explicitly no tool call, task handoff, floating button, or
 * voice input anywhere in this component or its dependencies.
 *
 * Talks only to this plugin's own `/warden/api/chat` (same origin) — never
 * `apps/harness` directly, matching RFC 0063 §3's "browser client never
 * talks to apps/harness directly."
 */
export function ChatView() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [state, setState] = useState<ViewState>({ kind: 'idle' });
  const [banner, setBanner] = useState<string | null>(null);

  async function send() {
    const content = input.trim();
    if (!content || state.kind === 'streaming') return;

    const hadPriorConversation = turns.length > 0;
    const nextTurns = [...turns, { role: 'user' as const, content }];
    setTurns(nextTurns);
    setInput('');
    setBanner(null);
    setPendingText('');
    setState({ kind: 'streaming' });

    let response: Response;
    try {
      response = await fetch('/warden/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: nextTurns }),
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
      <div className={styles.scrollArea}>
        <MessageScroller>
          {turns.length === 0 && pendingText === null && (
            <div className={styles.emptyState}>
              <EmptyState
                heading="Ask Warden anything"
                description="Basic chat, running entirely on infrastructure you control."
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
          disabled={!input.trim() || state.kind === 'streaming'}
          loading={state.kind === 'streaming'}
        >
          Send
        </Button>
      </form>
    </div>
  );
}
