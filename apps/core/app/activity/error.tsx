'use client';

import { Button, Card } from '@sovereignfs/ui';
import styles from '../security/security.module.css';

export default function ActivityError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.text}>
          Your activity is not available right now. Try again in a moment.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </Card>
  );
}
