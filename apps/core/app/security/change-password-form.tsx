'use client';

import { type FormEvent, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../src/auth/client';
import styles from './security.module.css';

/** Changing the password asks for the current one, and ends every other session. */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setDone(false);
    const result = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (result.error) {
      setError(messageFor(result.error));
      return;
    }
    setCurrent('');
    setNext('');
    setDone(true);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {done ? (
        <Alert variant="success">
          Your password is changed. You were signed out everywhere else.
        </Alert>
      ) : null}
      <FormField label="Current password" required>
        {(field) => (
          <Input
            {...field}
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="New password" required>
        {(field) => (
          <Input
            {...field}
            type="password"
            name="newPassword"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        )}
      </FormField>
      <div className={styles.row}>
        <Button type="submit" loading={pending}>
          {pending ? 'Saving…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
}

/** What went wrong, in words a person can act on. The server's password message is already that. */
function messageFor(error: { status: number; code?: string; message?: string }): string {
  if (error.code === 'INVALID_PASSWORD') return 'Your current password is not right.';
  if (error.code === 'PASSWORD_DOES_NOT_MEET_POLICY' && error.message) return error.message;
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  return 'Your password could not be changed. Check what you entered and try again.';
}
