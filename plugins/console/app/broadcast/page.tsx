'use client';

import { useState } from 'react';
import { Button, Checkbox, FormField, Input, Textarea, useToast } from '@sovereignfs/ui';
import type { DirectoryUser } from '@sovereignfs/sdk';
import { ConsolePageHeader } from '../_components/ConsolePageHeader';
import { RecipientPicker } from '../_components/RecipientPicker';
import styles from '../console.module.css';

interface BroadcastResult {
  ok?: boolean;
  sent?: number;
  error?: string;
}

export default function BroadcastPage() {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [recipients, setRecipients] = useState<DirectoryUser[]>([]);
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (recipients.length === 0) {
      setError('Pick at least one recipient.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/account/broadcast', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientUserIds: recipients.map((r) => r.id),
          title: title.trim(),
          body: body.trim() || undefined,
          url: url.trim() || undefined,
          category: 'announcement',
          sendEmail,
        }),
      });
      const data = (await res.json()) as BroadcastResult;
      if (data.ok) {
        const sent = data.sent ?? 0;
        toast.show({
          title: `Broadcast sent to ${sent} ${sent === 1 ? 'person' : 'people'}.`,
          category: 'success',
        });
        setTitle('');
        setBody('');
        setUrl('');
        setRecipients([]);
        setSendEmail(false);
      } else {
        setError(data.error ?? 'The broadcast could not be sent.');
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
        title="Broadcast"
        description="Send an announcement notification to one or more people. Limited to one broadcast per minute."
      />

      <form
        className={styles.composeForm}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <FormField label="Title" id="broadcast-title" required>
          {(field) => (
            <Input
              {...field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scheduled maintenance tonight"
              disabled={sending}
              required
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
        <FormField label="Link (optional)" id="broadcast-url" hint="Where the notification opens.">
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

        <RecipientPicker value={recipients} onChange={setRecipients} disabled={sending} />

        <Checkbox
          id="broadcast-send-email"
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
          {sending ? 'Sending…' : 'Send broadcast'}
        </Button>
      </form>
    </div>
  );
}
