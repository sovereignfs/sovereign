import { useEffect, useRef, type FormEvent } from 'react';
import { useHydrated } from '../../hooks/useHydrated';
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

/**
 * Changing the password (auth.md §7): it asks for the current one, and ends every other session. The boxes are read when the form is
 * sent, as in `SignInForm`: a password manager can fill them without telling the page. The button is off until the page is running,
 * as `AuthButton`'s is, so a browser never sends the passwords itself.
 */
export function ChangePasswordForm({
  error,
  done = false,
  pending = false,
  onSubmit,
}: ChangePasswordFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();
  // Once a change is done the boxes are emptied, once.
  useEffect(() => {
    if (done) form.current?.reset();
  }, [done]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const boxes = new FormData(event.currentTarget);
    onSubmit({
      current: String(boxes.get('currentPassword') ?? ''),
      next: String(boxes.get('newPassword') ?? ''),
    });
  }

  return (
    <form ref={form} className={styles.form} onSubmit={submit}>
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
          />
        )}
      </FormField>
      <FormField label="New password" required>
        {(field) => (
          <Input {...field} type="password" name="newPassword" autoComplete="new-password" />
        )}
      </FormField>
      <div className={styles.row}>
        <Button type="submit" loading={pending} disabled={!hydrated}>
          {pending ? 'Saving…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
}
