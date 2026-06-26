'use client';

import { useActionState } from 'react';
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
          <button type="button" className={styles.actionButton} onClick={onSuccess}>
            Done
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.inviteForm}>
      {state && !state.success && <p className={styles.errorText}>{state.error}</p>}

      <div className={styles.fieldGroup}>
        <label htmlFor="invite-email" className={styles.label}>
          Email address
        </label>
        <input
          id="invite-email"
          type="email"
          name="email"
          required
          placeholder="user@example.com"
          className={styles.input}
          autoComplete="off"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="invite-expires" className={styles.label}>
          Expires in (days) <span className={styles.optional}>optional</span>
        </label>
        <input
          id="invite-expires"
          type="number"
          name="expiresInDays"
          min="1"
          max="365"
          placeholder="7"
          className={styles.input}
        />
      </div>

      <button type="submit" disabled={pending} className={styles.actionButton}>
        {pending ? 'Sending…' : 'Send invitation'}
      </button>
    </form>
  );
}
