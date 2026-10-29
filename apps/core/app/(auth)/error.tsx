'use client';

import { Button } from '@sovereignfs/ui';
import { AuthShell } from './auth-shell';
import styles from './auth.module.css';

export default function AuthError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AuthShell>
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.lead}>Signing in is not available right now. Try again in a moment.</p>
      <div className={styles.form}>
        <Button className={styles.submit} onClick={reset}>
          Try again
        </Button>
      </div>
    </AuthShell>
  );
}
