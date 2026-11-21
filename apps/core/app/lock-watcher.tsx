'use client';

import { useEffect } from 'react';

/** How often, at most, the watcher tells core the person is using the page: core writes every one (src/lock/store.ts). */
const PING_EVERY_MS = 15_000;
/** How often it looks at the time. */
const CHECK_EVERY_MS = 5_000;

const toLockPage = () => {
  const here = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/lock?returnTo=${encodeURIComponent(here)}`);
};

const tell = (event: 'activity' | 'leave') =>
  // `keepalive`, so a request made as the page is hidden still goes; it carries the page's origin, which the route checks.
  fetch(`/api/lock/${event}`, { method: 'POST', keepalive: true }).catch(() => undefined);

/** Tells core the person is here, and shows the lock page if core answers that the session is locked. */
const here = async () => {
  if ((await tell('activity'))?.status === 401) toLockPage();
};

/**
 * The lock's watcher on every signed-in page of a session under a lock (RFC 0006 B2). It says it is here as the page opens, counts what
 * the person does (a tap, a key, a scroll), tells core about it at most every 15 seconds, and once the idle time has passed with nothing
 * done, goes to the lock page, so a screen left open stops showing the person's data. With "also lock when I leave the app", hiding the
 * page tells core it was left; core locks the session unless a page of it is back within a few seconds, which a navigation to another
 * page always is, and coming back asks core. Core decides from its own times; this only makes it seen at once.
 */
export function LockWatcher({ idleSeconds, onLeave }: { idleSeconds: number; onLeave: boolean }) {
  useEffect(() => {
    let lastUse = Date.now();
    let lastPing = Date.now();
    let left = false;
    void here();
    const used = () => {
      lastUse = Date.now();
      if (lastUse - lastPing >= PING_EVERY_MS) {
        lastPing = lastUse;
        void tell('activity');
      }
    };
    const timer = window.setInterval(() => {
      if (Date.now() - lastUse > idleSeconds * 1000) toLockPage();
    }, CHECK_EVERY_MS);
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        if (onLeave) {
          left = true;
          void tell('leave');
        }
        return;
      }
      if (Date.now() - lastUse > idleSeconds * 1000) {
        toLockPage();
        return;
      }
      if (left) {
        left = false;
        lastPing = Date.now();
        void here();
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const name of events) window.addEventListener(name, used, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, used);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [idleSeconds, onLeave]);
  return null;
}
