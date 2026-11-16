'use client';

import { startTransition, useActionState, useState } from 'react';
import { Alert, Button, ConfirmDialog, FormField, Input, Select } from '@sovereignfs/ui';
import { signInValue } from '../../../src/auth/derive';
import type { TransferTarget } from '../../../src/roles/ownership';
import { transferOwnershipAction, type TransferResult } from './actions';
import styles from './ownership.module.css';

/**
 * Hands the instance to an admin. Nothing is sent until the owner has chosen, typed their password and confirmed in
 * a question that names who will own it. The password stays in the box if the server refuses it.
 */
export function TransferForm({
  targets,
  address,
}: {
  targets: TransferTarget[];
  /** The owner's own address, which the password's sign-in value is made from (core-app §5.2). */
  address: string;
}) {
  const [target, setTarget] = useState('');
  const [newRole, setNewRole] = useState('platform:admin');
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState<TransferResult | null, FormData>(
    transferOwnershipAction,
    null,
  );
  const chosen = targets.find((candidate) => candidate.id === target);

  const [preparing, setPreparing] = useState<string | undefined>();
  const send = () => {
    setPreparing(undefined);
    const form = new FormData();
    form.set('target', target);
    form.set('newRole', newRole);
    // What is sent is made from the password, which never leaves the browser (core-app §5.2).
    void signInValue(password, address).then(
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
        if (chosen && password !== '') setOpen(true);
      }}
    >
      <FormField label="New owner" required>
        {(field) => (
          <Select {...field} value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Choose an admin…</option>
            {targets.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} ({candidate.email})
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField
        label="You will become"
        hint="You keep access to the Console as an admin, or step back to an ordinary account."
      >
        {(field) => (
          <Select {...field} value={newRole} onChange={(event) => setNewRole(event.target.value)}>
            <option value="platform:admin">An admin</option>
            <option value="platform:user">An ordinary user</option>
          </Select>
        )}
      </FormField>
      <FormField
        label="Your password"
        required
        hint="We ask again because this cannot be undone by you."
      >
        {(field) => (
          <Input
            {...field}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </FormField>
      <div>
        <Button type="submit" variant="destructive" disabled={!chosen || password === ''}>
          Hand over ownership…
        </Button>
      </div>
      {state && !state.ok && !open ? <Alert variant="error">{state.error}</Alert> : null}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Hand over this instance?"
        message={
          <>
            {chosen ? <strong>{chosen.name}</strong> : 'They'} will own this instance. Only they can
            hand it back, and you will no longer be able to change what roles can do, make people
            admins or set up email.
          </>
        }
        confirmLabel={pending ? 'Handing over…' : 'Hand over ownership'}
        destructive
        pending={pending}
        error={preparing ?? (state && !state.ok ? state.error : undefined)}
        onConfirm={send}
      />
    </form>
  );
}
