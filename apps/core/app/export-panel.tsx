'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, ConfirmDialog, FormField, Input } from '@sovereignfs/ui';
import { signInValue } from '../src/auth/derive';
import type { ExportView } from '../src/exports/view';
import styles from './export-panel.module.css';

export type ExportActionResult = { ok: true } | { ok: false; error: string };

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Taking an export and downloading it once (core-app §4.7.3), for the owner's export and a person's alike. The password is asked again
 * and sent as the value the browser derives (core-app §5.2); while an export is being made the page looks again every few seconds.
 */
export function ExportPanel({
  view,
  address,
  kind,
  action,
  disabledReason,
  confirmTitle,
  confirmMessage,
  startLabel,
}: {
  view: ExportView;
  address: string;
  kind: 'instance' | 'person';
  action: (previous: ExportActionResult | null, form: FormData) => Promise<ExportActionResult>;
  disabledReason?: string;
  confirmTitle: string;
  confirmMessage: string;
  startLabel: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState<string | undefined>();
  const [state, act, pending] = useActionState<ExportActionResult | null, FormData>(
    async (previous, form) => {
      const result = await action(previous, form);
      if (result.ok) {
        setOpen(false);
        setPassword('');
      }
      return result;
    },
    null,
  );

  useEffect(() => {
    if (view.state !== 'making') return undefined;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [view.state, router]);

  const send = () => {
    setPreparing(undefined);
    void signInValue(password, address).then(
      (value) => {
        const form = new FormData();
        form.set('password', value);
        startTransition(() => act(form));
      },
      () => setPreparing('This page could not get ready. Reload it and try again.'),
    );
  };

  return (
    <div className={styles.panel}>
      {view.state === 'making' ? (
        <Alert variant="info">
          Your export is being made, since {time(view.requestedAt)}. This page shows it when it is
          ready.
        </Alert>
      ) : null}
      {view.state === 'ready' && view.here ? (
        <form
          className={styles.ready}
          method="post"
          action={`/api/exports/${view.id}?kind=${kind}`}
          onSubmit={() => setTimeout(() => router.refresh(), 2000)}
        >
          <p className={styles.hint}>
            Your export is ready ({size(view.size)}). It can be downloaded once, until{' '}
            {time(view.until)}; then it is deleted.
          </p>
          <div>
            <Button type="submit">Download</Button>
          </div>
        </form>
      ) : null}
      {view.state === 'ready' && !view.here ? (
        <p className={styles.hint}>
          An export is ready in the browser that asked for it, until {time(view.until)}.
        </p>
      ) : null}
      {view.state === 'failed' ? (
        <Alert variant="error">
          The last export could not be made. Try again; if it fails again, the server’s log says
          why.
        </Alert>
      ) : null}

      {view.state === 'making' ? null : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (password !== '' && !disabledReason) setOpen(true);
          }}
        >
          {disabledReason ? <p className={styles.hint}>{disabledReason}</p> : null}
          <FormField
            label="Your password"
            required
            hint="We ask again because the export holds everything listed above."
          >
            {(field) => (
              <Input
                {...field}
                type="password"
                autoComplete="current-password"
                disabled={Boolean(disabledReason)}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
          <div>
            <Button type="submit" disabled={password === '' || Boolean(disabledReason)}>
              {startLabel}
            </Button>
          </div>
          {state && !state.ok && !open ? <Alert variant="error">{state.error}</Alert> : null}
          <ConfirmDialog
            open={open}
            onClose={() => setOpen(false)}
            title={confirmTitle}
            message={confirmMessage}
            confirmLabel={pending ? 'Starting…' : startLabel}
            pending={pending}
            error={preparing ?? (state && !state.ok ? state.error : undefined)}
            onConfirm={send}
          />
        </form>
      )}
    </div>
  );
}
