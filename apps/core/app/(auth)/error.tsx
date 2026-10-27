'use client';

import { Button, Card, PageContainer } from '@sovereignfs/ui';
import styles from './auth.module.css';

export default function AuthError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.lead}>
            Signing in is not available right now. Try again in a moment.
          </p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </Card>
    </PageContainer>
  );
}
