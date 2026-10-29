'use client';

import { Button, Card } from '@sovereignfs/ui';
import styles from './console.module.css';

export default function ConsoleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card padding="lg">
      <div className={styles.page}>
        <h1 className={styles.heading}>Something went wrong</h1>
        <p className={styles.lead}>This page could not be shown. Try again in a moment.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </Card>
  );
}
