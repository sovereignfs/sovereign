'use client';

import { useEffect } from 'react';
import styles from './auth.module.css';

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
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.error}>An unexpected error occurred. Please try again.</p>
        <button
          onClick={reset}
          style={{
            marginTop: 'var(--sv-space-4)',
            background: 'none',
            border: 'none',
            color: 'var(--sv-color-accent)',
            fontWeight: 'var(--sv-font-weight-medium)',
            cursor: 'pointer',
            fontSize: 'var(--sv-font-size-sm)',
            fontFamily: 'inherit',
            padding: 0,
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
