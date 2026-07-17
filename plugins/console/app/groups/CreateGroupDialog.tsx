'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button, Dialog, FormField, Input } from '@sovereignfs/ui';
import { createGroupAction, type GroupActionState } from './actions';
import styles from '../console.module.css';

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<GroupActionState | null, FormData>(
    createGroupAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + New group
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} size="sm" title="New group">
        <form ref={formRef} action={formAction} className={styles.inviteForm}>
          {state && !state.success && <p className={styles.errorText}>{state.error}</p>}

          <FormField label="Name" id="group-name" required>
            {(field) => <Input {...field} name="name" placeholder="Finance" autoComplete="off" />}
          </FormField>

          <FormField label="Description (optional)" id="group-description">
            {(field) => (
              <Input
                {...field}
                name="description"
                placeholder="Finance and accounting staff"
                autoComplete="off"
              />
            )}
          </FormField>

          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create group'}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
