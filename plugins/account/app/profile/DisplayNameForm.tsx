'use client';

import { useActionState, useEffect } from 'react';
import { Button, FormField, Input, useToast } from '@sovereignfs/ui';
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
      <FormField label="Name" id="name" required>
        {(field) => (
          <Input {...field} name="name" type="text" maxLength={100} defaultValue={initialName} />
        )}
      </FormField>
      {state && !state.ok && (
        <p className={styles.feedbackError} role="status" aria-live="polite">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </Button>
    </form>
  );
}
