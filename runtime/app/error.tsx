'use client';

import { useEffect, useState } from 'react';
import styles from './_error.module.css';

/**
 * Root error boundary. Also catches the failure mode of an in-app (client-side)
 * navigation attempted with no network: Workbox's `/offline` document fallback
 * (`next.config.ts` `fallbacks.document`) only applies to a real browser-level
 * navigation request, not Next's client router fetching the next page's RSC
 * payload — a failed client-side transition just throws, landing here instead
 * of the offline shell. Rather than show a scary generic 500 for what's really
 * just "you're offline," check `navigator.onLine` and show the same copy as
 * `app/offline/page.tsx` when it's the culprit.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    console.error(error);
    setOffline(!navigator.onLine);
  }, [error]);

  if (offline) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.message}>You’re offline</h1>
          <p className={styles.message}>
            Sovereign can’t reach the server right now. Reconnect and try again.
          </p>
          <button className={styles.link} onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    );
  }

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
