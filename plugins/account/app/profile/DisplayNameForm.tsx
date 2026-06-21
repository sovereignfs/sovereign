'use client';

import { useActionState } from 'react';
import { type DisplayNameResult, updateDisplayNameAction } from '../actions';
import styles from '../account.module.css';

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState<DisplayNameResult | null, FormData>(
    updateDisplayNameAction,
    null,
  );

  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={initialName}
          className={styles.input}
        />
      </div>
      {state && (
        <p
          className={state.ok ? styles.feedbackSuccess : styles.feedbackError}
          role="status"
          aria-live="polite"
        >
          {state.ok ? state.message : state.error}
        </p>
      )}
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </button>
    </form>
  );
}
