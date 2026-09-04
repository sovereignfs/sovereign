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
        {/*
          Deliberately not `error.message`. Anything reaching this boundary
          is by definition unexpected, so its message is raw internal text —
          this page once showed users "Unsupported state or unable to
          authenticate data" verbatim when a stored provider key failed to
          decrypt. That tells them nothing they can act on and reads as a
          crash. The digest is what actually correlates to the server log.
        */}
        <p className={styles.errorDetail}>
          Warden hit an unexpected problem. Try again — if it keeps happening, check your provider
          settings.
        </p>
        {error.digest && <p className={styles.errorDetail}>Reference: {error.digest}</p>}
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
