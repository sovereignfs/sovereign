'use client';

import { useEffect } from 'react';
import { Button, EmptyState } from '@sovereignfs/ui';

/**
 * Plugin-scoped error boundary (sv-ui-design convention) — an unexpected
 * error inside Console degrades to this plain-copy card instead of the bare
 * platform 500. Expected failures (a bad admin API response, a rejected
 * action) never reach here; they're handled inline via the `ActionResult`
 * convention in each section's `actions.ts`.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      heading="Something went wrong."
      description={error.message || 'An unexpected error occurred.'}
      action={
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
