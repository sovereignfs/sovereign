'use client';

import { useState } from 'react';
import { Button, Input } from '@sovereignfs/ui';
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
      const res = await fetch('/api/admin/broadcast', {
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
        <div className={broadcastStyles.field}>
          <label htmlFor="broadcast-title" className={broadcastStyles.label}>
            Title <span aria-hidden="true">*</span>
          </label>
          <Input
            id="broadcast-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Scheduled maintenance tonight"
            disabled={sending}
          />
        </div>
        <div className={broadcastStyles.field}>
          <label htmlFor="broadcast-body" className={broadcastStyles.label}>
            Message (optional)
          </label>
          <textarea
            id="broadcast-body"
            className={broadcastStyles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Additional details…"
            rows={3}
            disabled={sending}
          />
        </div>
        <div className={broadcastStyles.field}>
          <label htmlFor="broadcast-url" className={broadcastStyles.label}>
            Link URL (optional)
          </label>
          <Input
            id="broadcast-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/console/settings"
            disabled={sending}
          />
        </div>
        <div className={broadcastStyles.field}>
          <label htmlFor="broadcast-recipients" className={broadcastStyles.label}>
            Recipient user IDs <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="broadcast-recipients"
            className={broadcastStyles.textarea}
            value={recipientIds}
            onChange={(e) => setRecipientIds(e.target.value)}
            placeholder="user-id-1, user-id-2, …"
            rows={3}
            disabled={sending}
          />
          <p className={broadcastStyles.hint}>
            Paste one or more user IDs, separated by commas or newlines. Find IDs on the Users page.
          </p>
        </div>

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
