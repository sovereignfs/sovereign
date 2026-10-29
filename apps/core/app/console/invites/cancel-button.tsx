'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button, ConfirmDialog } from '@sovereignfs/ui';
import { cancelInviteAction, type CancelResult } from './actions';

/** Cancels one invitation after asking; the dialog stays up to show a refusal. */
export function CancelButton({ id, email }: { id: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState<CancelResult | null, null>(
    (previous) => cancelInviteAction(id, previous),
    null,
  );

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Cancel
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this invitation?"
        message={`The link sent to ${email} stops working. They can still be invited again.`}
        confirmLabel={pending ? 'Cancelling…' : 'Cancel invitation'}
        destructive
        pending={pending}
        error={state && !state.ok ? state.error : undefined}
        onConfirm={() => startTransition(() => act(null))}
      />
    </>
  );
}
