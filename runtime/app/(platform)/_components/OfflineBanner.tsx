'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, useIsOffline } from '@sovereignfs/ui';
import styles from './OfflineBanner.module.css';

type Status = 'online' | 'offline' | 'reconnected';

export function OfflineBanner() {
  // Connectivity detection itself lives in @sovereignfs/ui's useIsOffline
  // (research 0012, epic task 2.32 — extracted so Console/Account/login share
  // the same source instead of re-deriving it slightly differently). This
  // component layers its own extra state on top: a 3s "Back online" flash on
  // reconnect that a boolean alone can't express.
  const isOffline = useIsOffline();
  const [status, setStatus] = useState<Status>('online');
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOffline = useRef(false);

  // Reserves space for the banner in the shell's own content padding
  // (shell.module.css reads this same variable) so the banner doesn't just
  // overlay the top of the page — .content's padding-top transitions
  // smoothly alongside the banner's own slideDown animation instead of
  // content abruptly jumping/being covered. Height is one fixed value for
  // both 'offline' and 'reconnected' (same 32px row in OfflineBanner.module.css).
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sv-offline-banner-height',
      status === 'online' ? '0px' : '32px',
    );
    return () => {
      document.documentElement.style.removeProperty('--sv-offline-banner-height');
    };
  }, [status]);

  useEffect(() => {
    const clearDismiss = () => {
      if (dismissTimer.current !== null) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };

    if (isOffline) {
      clearDismiss();
      wasOffline.current = true;
      setStatus('offline');
    } else if (wasOffline.current) {
      // Only flash "reconnected" for a transition we actually observed —
      // not on first mount, when isOffline starts false with nothing to
      // recover from.
      clearDismiss();
      wasOffline.current = false;
      setStatus('reconnected');
      dismissTimer.current = setTimeout(() => setStatus('online'), 3000);
    }

    return clearDismiss;
  }, [isOffline]);

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
