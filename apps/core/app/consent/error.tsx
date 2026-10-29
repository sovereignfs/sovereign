'use client';

import { Button, Card, PageContainer } from '@sovereignfs/ui';
import styles from '../(auth)/auth.module.css';

export default function ConsentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.lead}>
            This request could not be shown. Go back to the app and sign in again, or try once more.
          </p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </Card>
    </PageContainer>
  );
}
