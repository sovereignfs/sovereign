'use client';

import { useActionState } from 'react';
import { Button, FormField, Input } from '@sovereignfs/ui';
import { changePasswordAction, type PasswordState } from '../actions';
import styles from '../account.module.css';

export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <form action={formAction} className={styles.form}>
      <FormField label="Current password" id="currentPassword" required>
        {(field) => (
          <Input
            {...field}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
          />
        )}
      </FormField>
      <FormField label="New password" id="newPassword" required>
        {(field) => (
          <Input
            {...field}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
          />
        )}
      </FormField>
      <FormField label="Confirm new password" id="confirmPassword" required>
        {(field) => (
          <Input
            {...field}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
          />
        )}
      </FormField>

      {state?.ok === false && <p className={styles.error}>{state.error}</p>}
      {state?.ok === true && <p className={styles.success}>Password changed.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  );
}
