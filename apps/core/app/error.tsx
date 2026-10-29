'use client';

import { Button, Card, PageContainer } from '@sovereignfs/ui';
import styles from './(auth)/auth.module.css';

/** What is shown when a page fails and its own section has no boundary of its own. */
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageContainer maxWidth="sm">
      <div className={styles.stage}>
        <Card padding="lg">
          <div className={styles.form}>
            <h1 className={styles.title}>Something went wrong</h1>
            <p className={styles.lead}>This page could not be shown. Try again in a moment.</p>
            <div>
              <Button onClick={reset}>Try again</Button>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
