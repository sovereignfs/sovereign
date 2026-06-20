'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@sovereignfs/ui';
import styles from './OfflineBanner.module.css';

type Status = 'online' | 'offline' | 'reconnected';

export function OfflineBanner() {
  // Always initialise to 'online' so the server-rendered HTML matches the
  // first client render. navigator.onLine is checked in useEffect (client-only)
  // to pick up the case where the user loads the page while already offline
  // (e.g. from the service-worker cache). The imperceptible one-frame delay
  // before the banner appears is preferable to a hydration mismatch.
  const [status, setStatus] = useState<Status>('online');
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearDismiss = () => {
      if (dismissTimer.current !== null) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };

    // Sync with actual connectivity state after hydration.
    if (!navigator.onLine) {
      setStatus('offline');
    }

    const handleOffline = () => {
      clearDismiss();
      setStatus('offline');
    };

    const handleOnline = () => {
      clearDismiss();
      setStatus('reconnected');
      dismissTimer.current = setTimeout(() => setStatus('online'), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      clearDismiss();
    };
  }, []);

  if (status === 'online') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={status === 'offline' ? styles.offline : styles.reconnected}
    >
      <Icon name="alert-triangle" size="sm" aria-hidden />
      {status === 'offline' ? 'No internet connection' : 'Back online'}
    </div>
  );
}
