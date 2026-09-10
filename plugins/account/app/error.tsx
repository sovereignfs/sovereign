'use client';

import { useEffect } from 'react';
import { Button, EmptyState } from '@sovereignfs/ui';

/**
 * Plugin-scoped error boundary — an unexpected error inside Account degrades
 * to this plain-copy card instead of the bare platform 500.
 */
export default function AccountError({
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
