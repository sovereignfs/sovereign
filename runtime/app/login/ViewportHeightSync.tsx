'use client';

import { useEffect } from 'react';
import { computeViewportHeight } from '@/src/viewport-height';

/**
 * Pushes a reliable full-screen height onto `--sv-vh` for the auth pages
 * (/login, /register, /login/2fa). These pages live outside the platform shell,
 * so they don't get ClientShell's viewport sync — without this, `.page`'s
 * `height: var(--sv-vh, 100dvh)` falls back to `100dvh`, which iOS standalone
 * PWAs report ~status-bar height short at launch, leaving a strip of the body
 * backdrop below the card. Renders nothing.
 */
export function ViewportHeightSync() {
  useEffect(() => {
    const sync = () =>
      document.documentElement.style.setProperty('--sv-vh', `${computeViewportHeight()}px`);
    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  return null;
}
