import { useState, type FormEvent } from 'react';
import { Alert } from '../Alert/Alert';
import { Button } from '../Button/Button';
import { FormField } from '../FormField/FormField';
import { Input } from '../Input/Input';
import styles from './Account.module.css';

export interface ChangePasswordFormProps {
  error?: string | undefined;
  /** The password is changed: the boxes empty and the form says so. */
  done?: boolean;
  pending?: boolean;
  /** The current and the new password, once the person submits them. The form never sends anything itself. */
  onSubmit: (values: { current: string; next: string }) => void;
}

/** Changing the password (auth.md §7): it asks for the current one, and ends every other session. */
export function ChangePasswordForm({
  error,
  done = false,
  pending = false,
  onSubmit,
}: ChangePasswordFormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [cleared, setCleared] = useState(done);
  // Once a change is done the boxes are emptied, once.
  if (done && !cleared) {
    setCleared(true);
    setCurrent('');
    setNext('');
  }
  if (!done && cleared) setCleared(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ current, next });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
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
