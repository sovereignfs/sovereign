'use client';

import { useState } from 'react';
import { Button, Checkbox, FormField, Input, Textarea, useToast } from '@sovereignfs/ui';
import type { DirectoryUser } from '@sovereignfs/sdk';
import { ConsolePageHeader } from '../_components/ConsolePageHeader';
import { RecipientPicker } from '../_components/RecipientPicker';
import styles from '../console.module.css';

interface SendResult {
  ok?: boolean;
  sentTo?: string[];
  skipped?: { userId: string; reason: string }[];
  error?: string;
}

/**
 * Console's admin message compose (RFC 0048 §5) — same shape as
 * `broadcast/page.tsx`: subject/body fields, a `notify` toggle, and
 * recipients as either picked people or "all active users". Calls
 * `sendAdminMessage()` via `/api/inbox/admin-messages`, which — unlike
 * broadcast — audits every send (`logActivity`).
 */
export default function ConsoleMessagesPage() {
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<DirectoryUser[]>([]);
  const [allActiveUsers, setAllActiveUsers] = useState(false);
  const [notify, setNotify] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    if (!subject.trim()) {
      setError('Subject is required.');
      return;
    }
    if (!body.trim()) {
      setError('Message is required.');
      return;
    }
    if (!allActiveUsers && recipients.length === 0) {
      setError('Pick at least one recipient, or choose “Send to all active users”.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/inbox/admin-messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          notify,
          sendEmail,
          ...(allActiveUsers
            ? { allActiveUsers: true }
            : { recipientUserIds: recipients.map((r) => r.id) }),
        }),
      });
      const data = (await res.json()) as SendResult;
      if (data.ok) {
        const sent = data.sentTo?.length ?? 0;
        const skipped = data.skipped?.length ?? 0;
        toast.show({
          title: `Message sent to ${sent} ${sent === 1 ? 'person' : 'people'}.`,
          message: skipped > 0 ? `${skipped} could not be delivered.` : undefined,
          category: 'success',
        });
        setSubject('');
        setBody('');
        setRecipients([]);
        setAllActiveUsers(false);
        setSendEmail(false);
      } else {
        setError(data.error ?? 'The message could not be sent.');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <ConsolePageHeader
        title="Messages"
        description="Send a message to selected people or to every active user. Recipients see it in their Inbox and, unless you turn it off, get a notification too."
      />

      <form
        className={styles.composeForm}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <FormField label="Subject" id="message-subject" required>
          {(field) => (
            <Input
              {...field}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Scheduled maintenance tonight"
              disabled={sending}
              required
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
              required
            />
          )}
        </FormField>

        <Checkbox
          id="message-all-active"
          checked={allActiveUsers}
          onChange={setAllActiveUsers}
          disabled={sending}
          label="Send to all active users"
        />
        {!allActiveUsers && (
          <RecipientPicker value={recipients} onChange={setRecipients} disabled={sending} />
        )}

        <Checkbox
          id="message-notify"
          checked={notify}
          onChange={setNotify}
          disabled={sending}
          label="Also send a notification"
        />
        <Checkbox
          id="message-send-email"
          checked={sendEmail}
          onChange={setSendEmail}
          disabled={sending}
          label="Also send an email (only to people who allow communication email)"
        />

        {error && (
          <p className={styles.feedbackError} role="status" aria-live="polite">
            {error}
          </p>
        )}

        <Button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send message'}
        </Button>
      </form>
    </div>
  );
}
