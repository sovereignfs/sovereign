'use client';

import { useActionState } from 'react';
import { Button, FormField, Input } from '@sovereignfs/ui';
import { addNote, type ActionResult } from './actions';
import styles from './example-encrypted.module.css';

const INITIAL: ActionResult = { ok: true };

export function NoteForm() {
  const [result, formAction, pending] = useActionState(addNote, INITIAL);

  return (
    <form action={formAction} className={styles.form}>
      <FormField label="Label" hint="Searchable by exact match — encrypted at rest" required>
        {(field) => (
          <Input {...field} name="label" placeholder="e.g. insurance number" maxLength={120} />
        )}
      </FormField>
      <FormField label="Note" hint="Encrypted at rest, never searchable" required>
        {(field) => (
          <Input
            {...field}
            name="body"
            placeholder="The private detail to remember"
            maxLength={500}
          />
        )}
      </FormField>
      {!result.ok && result.error && (
        <p role="alert" className={styles.formError}>
          {result.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Add note'}
      </Button>
    </form>
  );
}
