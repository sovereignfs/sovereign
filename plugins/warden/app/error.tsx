'use client';

import { useEffect } from 'react';
import { Button } from '@sovereignfs/ui';
import styles from './warden.module.css';

/**
 * Plugin-scoped error boundary (sv-ui-design convention) — an unexpected
 * error inside Warden degrades to this plain-copy card instead of the bare
 * platform 500. Expected failures (a bad provider URL, a rejected key) never
 * reach here; they're handled inline via the `ActionResult` convention in
 * `app/actions.ts`.
 */
export default function WardenError({
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
    <div className={styles.emptyState}>
      <div className={styles.errorCard}>
        <p className={styles.errorEyebrow}>Warden</p>
        <h1 className={styles.errorMessage}>Something went wrong.</h1>
        <p className={styles.errorDetail}>{error.message || 'An unexpected error occurred.'}</p>
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
