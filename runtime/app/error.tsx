'use client';

import { useEffect } from 'react';
import styles from './_error.module.css';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.code}>500</h1>
        <p className={styles.message}>Something went wrong.</p>
        <button className={styles.link} onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
