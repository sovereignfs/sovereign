'use client';

import { useState } from 'react';
import { Button, Checkbox, FormField, Input, Textarea } from '@sovereignfs/ui';
import styles from '../console.module.css';
import messagesStyles from './messages.module.css';

interface SendResult {
  ok?: boolean;
  sentTo?: string[];
  skipped?: { userId: string; reason: string }[];
  error?: string;
}

/**
 * Console's admin message compose (RFC 0048 §5) — same shape as
 * `broadcast/page.tsx`: subject/body fields, a `notify` toggle, and
 * recipients as either a pasted user-ID list or "all active users". Calls
 * `sendAdminMessage()` via `/api/inbox/admin-messages`, which — unlike
 * broadcast — audits every send (`logActivity`).
 */
export default function ConsoleMessagesPage() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientIds, setRecipientIds] = useState('');
  const [allActiveUsers, setAllActiveUsers] = useState(false);
  const [notify, setNotify] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const send = async () => {
    if (!subject.trim()) {
      setResult({ error: 'Subject is required.' });
      return;
    }
    if (!body.trim()) {
      setResult({ error: 'Message is required.' });
      return;
    }
    const ids = recipientIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allActiveUsers && ids.length === 0) {
      setResult({
        error: 'At least one recipient user ID is required, or check "Send to all active users".',
      });
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/inbox/admin-messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          notify,
          ...(allActiveUsers ? { allActiveUsers: true } : { recipientUserIds: ids }),
        }),
      });
      const data = (await res.json()) as SendResult;
      setResult(data);
      if (data.ok) {
        setSubject('');
        setBody('');
        setRecipientIds('');
        setAllActiveUsers(false);
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
        <h2 className={styles.pageTitle}>Send Message</h2>
      </div>
      <p className={messagesStyles.description}>
        Send a durable message to selected users or every active user. Recipients see it in their
        Inbox, and, unless unchecked, get a notification too.
      </p>
      <div className={messagesStyles.form}>
        <FormField label="Subject" id="message-subject" required>
          {(field) => (
            <Input
              {...field}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Scheduled maintenance tonight"
              disabled={sending}
            />
          )}
        </FormField>
        <FormField label="Message" id="message-body" required>
          {(field) => (
            <Textarea
              {...field}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message body…"
              rows={5}
              disabled={sending}
            />
          )}
        </FormField>
        <Checkbox
          id="message-notify"
          checked={notify}
          onChange={() => setNotify((v) => !v)}
          disabled={sending}
          label="Also create a notification alert"
        />
        <Checkbox
          id="message-all-active"
          checked={allActiveUsers}
          onChange={() => setAllActiveUsers((v) => !v)}
          disabled={sending}
          label="Send to all active users"
        />
        {!allActiveUsers && (
          <FormField
            label="Recipient user IDs"
            id="message-recipients"
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
        )}

        {result && (
          <div className={result.ok ? messagesStyles.success : messagesStyles.error} role="status">
            {result.ok
              ? `Sent to ${String(result.sentTo?.length ?? 0)} recipient${(result.sentTo?.length ?? 0) !== 1 ? 's' : ''}.${
                  result.skipped?.length
                    ? ` ${String(result.skipped.length)} skipped (not found).`
                    : ''
                }`
              : (result.error ?? 'An error occurred.')}
          </div>
        )}

        <Button onClick={() => void send()} disabled={sending}>
          {sending ? 'Sending…' : 'Send message'}
        </Button>
      </div>
    </div>
  );
}
