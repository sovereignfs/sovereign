'use client';

import { useState } from 'react';
import { Button, FormField, Input, Textarea } from '@sovereignfs/ui';
import styles from '../console.module.css';
import broadcastStyles from './broadcast.module.css';

interface BroadcastResult {
  ok?: boolean;
  sent?: number;
  error?: string;
}

export default function BroadcastPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [recipientIds, setRecipientIds] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const send = async () => {
    const ids = recipientIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!title.trim()) {
      setResult({ error: 'Title is required.' });
      return;
    }
    if (ids.length === 0) {
      setResult({ error: 'At least one recipient User ID is required.' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/account/broadcast', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientUserIds: ids,
          title: title.trim(),
          body: body.trim() || undefined,
          url: url.trim() || undefined,
          category: 'announcement',
        }),
      });
      const data = (await res.json()) as BroadcastResult;
      setResult(data);
      if (data.ok) {
        setTitle('');
        setBody('');
        setUrl('');
        setRecipientIds('');
      }
    } catch {
      setResult({ error: 'Network error — please try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Broadcast Notification</h2>
      </div>
      <p className={broadcastStyles.description}>
        Send an <strong>announcement</strong> notification to one or more users. Rate-limited to
        once per 60 seconds.
      </p>
      <div className={broadcastStyles.form}>
        <FormField label="Title" id="broadcast-title" required>
          {(field) => (
            <Input
              {...field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scheduled maintenance tonight"
              disabled={sending}
            />
          )}
        </FormField>
        <FormField label="Message (optional)" id="broadcast-body">
          {(field) => (
            <Textarea
              {...field}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Additional details…"
              rows={3}
              disabled={sending}
            />
          )}
        </FormField>
        <FormField label="Link URL (optional)" id="broadcast-url">
          {(field) => (
            <Input
              {...field}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/console/settings"
              disabled={sending}
            />
          )}
        </FormField>
        <FormField
          label="Recipient user IDs"
          id="broadcast-recipients"
          required
          hint="Paste one or more user IDs, separated by commas or newlines. Find IDs on the Users page."
        >
          {(field) => (
            <Textarea
              {...field}
              value={recipientIds}
              onChange={(e) => setRecipientIds(e.target.value)}
              placeholder="user-id-1, user-id-2, …"
              rows={3}
              disabled={sending}
            />
          )}
        </FormField>

        {result && (
          <div
            className={result.ok ? broadcastStyles.success : broadcastStyles.error}
            role="status"
          >
            {result.ok
              ? `Sent to ${result.sent ?? 0} recipient${(result.sent ?? 0) !== 1 ? 's' : ''}.`
              : (result.error ?? 'An error occurred.')}
          </div>
        )}

        <Button onClick={() => void send()} disabled={sending}>
          {sending ? 'Sending…' : 'Send broadcast'}
        </Button>
      </div>
    </div>
  );
}
