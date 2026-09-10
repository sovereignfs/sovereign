'use client';

import { useEffect } from 'react';
import { Button, EmptyState } from '@sovereignfs/ui';

/**
 * Plugin-scoped error boundary — an unexpected error inside Inbox degrades
 * to this plain-copy card instead of the bare platform 500.
 */
export default function InboxError({
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
      description="Inbox hit a snag loading this page. Your messages are safe — try again."
      action={
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
