'use client';

import { useActionState, useEffect } from 'react';
import { useToast } from '@sovereignfs/ui';
import { type DisplayNameResult, updateDisplayNameAction } from '../actions';
import styles from '../account.module.css';

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const toast = useToast();
  const [state, action, pending] = useActionState<DisplayNameResult | null, FormData>(
    updateDisplayNameAction,
    null,
  );

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.show({ title: state.message, category: 'success' });
    }
  }, [state, toast]);

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
      {state && !state.ok && (
        <p className={styles.feedbackError} role="status" aria-live="polite">
          {state.error}
        </p>
      )}
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </button>
    </form>
  );
}
