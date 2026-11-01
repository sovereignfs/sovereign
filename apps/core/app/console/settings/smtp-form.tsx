'use client';

import { startTransition, useActionState, useState } from 'react';
import { Alert, Button, Checkbox, FormField, Input } from '@sovereignfs/ui';
import { resetSmtpAction, saveSmtpAction, type SettingsResult } from './actions';
import type { ShownSmtp } from '../../../src/instance/describe';
import { sourceNote } from './source-note';
import styles from './settings.module.css';

/**
 * How email is sent. A blank field falls back to the server's `SV_SMTP_*` setting. The password is never
 * shown again once saved: leaving it blank keeps it, typing replaces it, and the box removes it.
 */
export function SmtpForm({ smtp, encryptionReady }: { smtp: ShownSmtp; encryptionReady: boolean }) {
  // Only what is saved here is put in a box: a value from the environment shows as a placeholder, so saving
  // does not turn the server's setting into a copy that would stop following it.
  const own = <T extends string | number>(shown: { value: T | undefined; source: string }) =>
    shown.source === 'saved' && shown.value !== undefined ? String(shown.value) : '';
  const fallback = <T extends string | number>(shown: { value: T | undefined; source: string }) =>
    shown.source === 'environment' && shown.value !== undefined ? String(shown.value) : undefined;

  const [host, setHost] = useState(own(smtp.host));
  const [port, setPort] = useState(own(smtp.port));
  const [user, setUser] = useState(own(smtp.user));
  const [from, setFrom] = useState(own(smtp.from));
  const [password, setPassword] = useState('');
  const [clear, setClear] = useState(false);
  const [state, save, saving] = useActionState<SettingsResult | null, FormData>(
    async (previous, form) => {
      const result = await saveSmtpAction(previous, form);
      if (result.ok) {
        setPassword('');
        setClear(false);
      }
      return result;
    },
    null,
  );
  const [resetState, reset, resetting] = useActionState<SettingsResult | null, null>(
    async (previous) => {
      const result = await resetSmtpAction(previous);
      if (result.ok) {
        setHost('');
        setPort('');
        setUser('');
        setFrom('');
        setPassword('');
        setClear(false);
      }
      return result;
    },
    null,
  );
  const shown = resetState ?? state;
  const kept = smtp.password.hasValue;
  const anySaved =
    [smtp.host, smtp.port, smtp.user, smtp.from].some((item) => item.source === 'saved') ||
    smtp.password.source === 'saved';

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        // A form action would reset the checkbox when it finished, undoing what a refusal should leave.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => save(data));
      }}
    >
      <div className={styles.grid}>
        <FormField label="Mail server" hint={sourceNote(smtp.host.source)}>
          {(field) => (
            <Input
              {...field}
              name="host"
              autoComplete="off"
              placeholder={fallback(smtp.host) ?? 'smtp.sovereign.local'}
              maxLength={255}
              value={host}
              onChange={(event) => setHost(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Port" hint="Leave empty for the default.">
          {(field) => (
            <Input
              {...field}
              name="port"
              inputMode="numeric"
              autoComplete="off"
              placeholder={fallback(smtp.port) ?? '587'}
              maxLength={5}
              value={port}
              onChange={(event) => setPort(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="From address" hint="For example Acme <noreply@sovereign.local>.">
          {(field) => (
            <Input
              {...field}
              name="from"
              autoComplete="off"
              placeholder={fallback(smtp.from) ?? 'noreply@sovereign.local'}
              maxLength={255}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="User name" hint="Only if the server needs a login.">
          {(field) => (
            <Input
              {...field}
              name="user"
              autoComplete="off"
              placeholder={fallback(smtp.user)}
              maxLength={255}
              value={user}
              onChange={(event) => setUser(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          label="Password"
          hint={
            smtp.password.unreadable
              ? 'The saved password can no longer be read. Type it again.'
              : kept
                ? smtp.password.source === 'saved'
                  ? 'A password is saved. Leave this empty to keep it.'
                  : 'The server’s environment supplies a password. Leave this empty to keep using it.'
                : 'No password is set.'
          }
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              name="password"
              autoComplete="new-password"
              maxLength={1024}
              disabled={clear}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>
      </div>
      {smtp.password.source === 'saved' ? (
        <>
          <input type="hidden" name="clearPassword" value={clear ? 'on' : ''} />
          <Checkbox label="Remove the saved password" checked={clear} onChange={setClear} />
        </>
      ) : null}
      {!encryptionReady ? (
        <Alert variant="warning">
          A password cannot be saved here until SV_FIELD_ENCRYPTION_KEYS is set on the server,
          because it would have nothing to encrypt it with. Set SV_SMTP_PASSWORD instead, or set the
          keys.
        </Alert>
      ) : null}
      <div className={styles.buttons}>
        <Button type="submit" loading={saving}>
          {saving ? 'Saving…' : 'Save email settings'}
        </Button>
        {anySaved ? (
          <Button
            type="button"
            variant="secondary"
            loading={resetting}
            onClick={() => startTransition(() => reset(null))}
          >
            Use the server’s settings
          </Button>
        ) : null}
      </div>
      {shown?.ok ? <Alert variant="success">{shown.message}</Alert> : null}
      {shown && !shown.ok ? <Alert variant="error">{shown.error}</Alert> : null}
    </form>
  );
}
