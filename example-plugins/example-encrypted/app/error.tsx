'use client';

import { Button } from '@sovereignfs/ui';
import styles from './example-encrypted.module.css';

export default function ExampleEncryptedError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className={styles.errorBoundary}>
      <h2>Something went wrong in Encrypted notes</h2>
      <p>Your notes are safe. Try again — if this keeps happening, tell your administrator.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
