'use client';

import { useEffect, useState } from 'react';

// The platform's canonical mobile breakpoint — matches the shell chrome and
// Dialog's own full-screen-sheet switch (`runtime/app/globals.css`,
// `Dialog.module.css`). A plugin whose own layout genuinely needs a different
// threshold may still hardcode its own value (e.g. a three-column layout that
// only needs to fork earlier than 768px) — this constant is the *default* every
// consumer should reach for first, so the platform's idea of "mobile" doesn't
// silently drift across components again.
export const MOBILE_BREAKPOINT_PX = 768;

/**
 * useIsMobile — whether the viewport is at or below the platform's mobile
 * breakpoint. SSR-safe: defaults to `false` (desktop) until the client mounts
 * and reads the real viewport, avoiding a hydration mismatch on first paint.
 */
export function useIsMobile(breakpointPx: number = MOBILE_BREAKPOINT_PX): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    setIsMobile(mql.matches);
    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [breakpointPx]);

  return isMobile;
}
