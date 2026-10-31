'use client';

import { startTransition, useActionState } from 'react';
import { Alert, Button } from '@sovereignfs/ui';
import { resolveNoticeAction, type ResolveResult } from './actions';

/** Marks one notice done, once the app's owner says what it held is gone by other means. */
export function ResolveButton({ id, app }: { id: string; app: string }) {
  const [state, resolve, pending] = useActionState<ResolveResult | null, null>(
    () => resolveNoticeAction(id),
    null,
  );
  return (
    <>
      {state && !state.ok ? <Alert variant="error">{state.error}</Alert> : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        aria-label={`Mark the notice to ${app} as done`}
        onClick={() => startTransition(() => resolve(null))}
      >
        {pending ? 'Marking…' : 'Mark as done'}
      </Button>
    </>
  );
}
