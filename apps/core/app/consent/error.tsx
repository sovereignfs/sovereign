'use client';

import { Button } from '@sovereignfs/ui';
import { AuthShell } from '../(auth)/auth-shell';
import styles from '../(auth)/auth.module.css';

export default function ConsentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AuthShell>
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.lead}>
        This request could not be shown. Go back to the app and sign in again, or try once more.
      </p>
      <div className={styles.form}>
        <Button className={styles.submit} onClick={reset}>
          Try again
        </Button>
      </div>
    </AuthShell>
  );
}
