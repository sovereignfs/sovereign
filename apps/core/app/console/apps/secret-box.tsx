'use client';

import { Alert, CopyButton } from '@sovereignfs/ui';
import styles from './apps.module.css';

/**
 * An app's secret, shown the one time it is known. Core keeps only a hash of it afterwards, so there is nothing
 * to show again: the box says so, and offers a way to copy it.
 */
export function SecretBox({ secret, message }: { secret: string; message: string }) {
  return (
    <Alert variant="warning">
      <p className={styles.secretMessage}>{message}</p>
      <span className={styles.secret}>
        <code className={styles.code}>{secret}</code>
        <CopyButton text={secret} label="Copy secret" />
      </span>
    </Alert>
  );
}
