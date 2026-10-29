'use client';

import { Button } from '@sovereignfs/ui';
import { AuthShell } from './(auth)/auth-shell';
import styles from './(auth)/auth.module.css';

/** What is shown when a page fails and its own section has no boundary of its own. */
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AuthShell>
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.lead}>This page could not be shown. Try again in a moment.</p>
      <div className={styles.form}>
        <Button className={styles.submit} onClick={reset}>
          Try again
        </Button>
      </div>
    </AuthShell>
  );
}
