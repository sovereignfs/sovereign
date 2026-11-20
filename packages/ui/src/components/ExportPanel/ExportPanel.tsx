'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Alert } from '../Alert/Alert';
import { Button } from '../Button/Button';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { FormField } from '../FormField/FormField';
import { Input } from '../Input/Input';
import styles from './ExportPanel.module.css';

/** Where an export stands, as a page shows it: never its file, nor whose session asked (`viewOf` in `@sovereignfs/export`). */
export type ExportPanelStatus =
  | { state: 'none' }
  | { state: 'making'; requestedAt: number }
  | { state: 'ready'; id: string; size: number; until: number; here: boolean }
  | { state: 'failed'; finishedAt: number }
  | { state: 'gone' };

export type ExportStartResult = { ok: true } | { ok: false; error: string };

export interface ExportPanelProps {
  status: ExportPanelStatus;
  /** Asks for an export with the password the person typed. The consumer derives what it sends and calls its own action. */
  onStart: (password: string) => Promise<ExportStartResult>;
  /** Where the download form posts, for a ready export. */
  downloadAction: (id: string) => string;
  /** Called every few seconds while an export is being made, and after a download, to show the new state. */
  onRefresh?: () => void;
  /** Says why no export can be taken yet, and turns the form off. */
  disabledReason?: string;
  confirmTitle: string;
  confirmMessage: string;
  startLabel: string;
  passwordHint?: string;
  /** The time zone times are written in. Default UTC, so the server and the browser agree. */
  timeZone?: string;
}

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function time(at: number, timeZone: string): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(
      at,
    );
  try {
    return format(timeZone);
  } catch {
    return format('UTC');
  }
}

/**
 * Taking an export and downloading it once: the password asked again, a confirmation of what the export holds, the state while it is
 * made, and a download that works once. The same for an operator's export and a person's, in core and in an app with no core. It knows
 * no framework: the consumer says how to start one, where to download it and how to look again.
 */
export function ExportPanel({
  status,
  onStart,
  downloadAction,
  onRefresh,
  disabledReason,
  confirmTitle,
  confirmMessage,
  startLabel,
  passwordHint = 'We ask again because the export holds everything listed above.',
  timeZone = 'UTC',
}: ExportPanelProps) {
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const [state, start, pending] = useActionState<ExportStartResult | null, string>(
    async (_previous, typed) => {
      let result: ExportStartResult;
      try {
        result = await onStart(typed);
      } catch {
        result = {
          ok: false,
          error: 'The export could not be started. Reload the page and try again.',
        };
      }
      if (result.ok) {
        setOpen(false);
        setPassword('');
        onRefresh?.();
      }
      return result;
    },
    null,
  );

  useEffect(() => {
    if (status.state !== 'making' || !onRefresh) return undefined;
    const timer = setInterval(onRefresh, 5000);
    return () => clearInterval(timer);
  }, [status.state, onRefresh]);

  const disabled = Boolean(disabledReason);

  return (
    <div className={styles.panel}>
      {status.state === 'making' ? (
        <Alert variant="info">
          Your export is being made, since {time(status.requestedAt, timeZone)}. This page shows it
          when it is ready.
        </Alert>
      ) : null}
      {status.state === 'ready' && status.here ? (
        <form
          className={styles.ready}
          method="post"
          action={downloadAction(status.id)}
          onSubmit={() => {
            if (onRefresh) setTimeout(onRefresh, 2000);
          }}
        >
          <p className={styles.hint}>
            Your export is ready ({size(status.size)}). It can be downloaded once, until{' '}
            {time(status.until, timeZone)}; then it is deleted.
          </p>
          <div>
            <Button type="submit">Download</Button>
          </div>
        </form>
      ) : null}
      {status.state === 'ready' && !status.here ? (
        <p className={styles.hint}>
          An export is ready in the browser that asked for it, until {time(status.until, timeZone)}.
        </p>
      ) : null}
      {status.state === 'failed' ? (
        <Alert variant="error">
          The last export could not be made. Try again; if it fails again, the server’s log says
          why.
        </Alert>
      ) : null}

      {status.state === 'making' ? null : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (password !== '' && !disabled) setOpen(true);
          }}
        >
          {disabledReason ? <p className={styles.hint}>{disabledReason}</p> : null}
          <FormField label="Your password" required hint={passwordHint}>
            {(field) => (
              <Input
                {...field}
                type="password"
                autoComplete="current-password"
                disabled={disabled}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
          <div>
            <Button type="submit" disabled={password === '' || disabled}>
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
            error={state && !state.ok ? state.error : undefined}
            onConfirm={() => startTransition(() => start(password))}
          />
        </form>
      )}
    </div>
  );
}
