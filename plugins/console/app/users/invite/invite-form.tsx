'use client';

import { useActionState } from 'react';
import { Button, FormField, Input } from '@sovereignfs/ui';
import { sendInviteAction, type InviteState } from '../actions';
import styles from '../../console.module.css';

type State = InviteState | null;

export function InviteForm({ onSuccess }: { onSuccess?: () => void }) {
  const [state, formAction, pending] = useActionState<State, FormData>(sendInviteAction, null);

  if (state?.success) {
    return (
      <div className={styles.successBox}>
        <p>
          Invitation sent to <strong>{state.email}</strong>.
        </p>
        <p className={styles.tokenNote}>
          If email is not configured, share this token manually:{' '}
          <code className={styles.token}>{state.token}</code>
        </p>
        {onSuccess && (
          <Button type="button" onClick={onSuccess}>
            Done
          </Button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.inviteForm}>
      {state && !state.success && <p className={styles.errorText}>{state.error}</p>}

      <FormField label="Email address" id="invite-email" required>
        {(field) => (
          <Input
            {...field}
            type="email"
            name="email"
            placeholder="user@example.com"
            autoComplete="off"
          />
        )}
      </FormField>

      <FormField label="Expires in (days) (optional)" id="invite-expires">
        {(field) => (
          <Input {...field} type="number" name="expiresInDays" min="1" max="365" placeholder="7" />
        )}
      </FormField>

      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
}
