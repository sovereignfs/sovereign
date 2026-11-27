'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import { Button, ConfirmDialog, FormField, Input } from '@sovereignfs/ui';
import { signInValue } from '../../src/auth/derive';
import { deleteAccountAction, type DeleteResult } from './actions';
import styles from '../security/security.module.css';

/**
 * Deletes the person's own account. A wrong password stays in the box, and nothing is sent until they have read, in a question of
 * its own, what will be lost.
 */
export function DeleteForm({ address }: { address: string }) {
  // The box is read when it is needed, never copied into state: a password manager can fill it without telling the page. It has no
  // name, so a form sent before the page is ready cannot put the password in the address.
  const box = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState<DeleteResult | null, FormData>(
    deleteAccountAction,
    null,
  );

  const [preparing, setPreparing] = useState<string | undefined>();
  const send = () => {
    setPreparing(undefined);
    const form = new FormData();
    // What is sent is made from the password, which never leaves the browser (core-app §5.2).
    void signInValue(box.current?.value ?? '', address).then(
      (value) => {
        form.set('password', value);
        startTransition(() => act(form));
      },
      () => setPreparing('This page could not get ready. Reload it and try again.'),
    );
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (box.current?.value) setOpen(true);
      }}
    >
      <FormField
        label="Your password"
        required
        hint="We ask again because deleting your account cannot be undone."
      >
        {(field) => <Input {...field} type="password" autoComplete="current-password" ref={box} />}
      </FormField>
      <div>
        <Button type="submit" variant="destructive">
          Delete my account…
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        message="Your account, your sign-in methods and your sessions are deleted at once, and every app loses what it was given. This cannot be undone."
        confirmLabel={pending ? 'Deleting…' : 'Delete my account'}
        destructive
        pending={pending}
        error={preparing ?? (state && !state.ok ? state.error : undefined)}
        onConfirm={send}
      />
    </form>
  );
}
