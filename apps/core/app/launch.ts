import type { MouseEvent } from 'react';
import { isInstalledDisplay } from '@sovereignfs/ui';

/**
 * How a launcher tile opens what it names, decided when it is clicked (RFC 0001 A5, research 0010), never while rendering, so every
 * person gets the same markup. Reading the display mode is allowed here: this runs in a click handler.
 */

type Click = Pick<
  MouseEvent<HTMLAnchorElement>,
  'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'preventDefault'
>;

export type LaunchDeps = {
  installed: () => boolean;
  open: (url: string) => void;
};

/** What trying a native app's address needs: whether this is a phone, going to the address, a timer, and noticing the page was left. */
export type AppAddressDeps = LaunchDeps & {
  phone: () => boolean;
  go: (url: string) => void;
  later: (then: () => void, ms: number) => void;
  /** Calls `left` if the page loses the person (another app came forward, or the browser asked); returns how to stop listening. */
  watch: (left: () => void) => () => void;
};

const browser: AppAddressDeps = {
  installed: isInstalledDisplay,
  open: (url) => {
    window.open(url, '_blank', 'noopener');
  },
  phone: () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  go: (url) => {
    window.location.href = url;
  },
  later: (then, ms) => {
    window.setTimeout(then, ms);
  },
  watch: (left) => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') left();
    };
    window.addEventListener('blur', left);
    window.addEventListener('pagehide', left);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', left);
      window.removeEventListener('pagehide', left);
      document.removeEventListener('visibilitychange', hidden);
    };
  },
};

/** How long a native app has to come forward before the shortcut's own address opens instead. */
export const APP_ADDRESS_WAIT_MS = 1000;

/** A plain click: the main button with no key that asks the browser for a tab or a window of its own, which it is left to do. */
export function plainClick(event: Click): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * An app's tile. In a browser tab, the link is followed in the same tab, as it always was. In an installed core, the app opens in a new
 * window, which desktop Chrome and Edge, and Android Chrome, hand to the app when it is installed too; where the device cannot (iPhone,
 * iPad, Safari), the new window is a browser view that closes back to core.
 */
export function openApp(event: Click, url: string, deps: LaunchDeps = browser): void {
  if (!plainClick(event) || !deps.installed()) return;
  event.preventDefault();
  deps.open(url);
}

/**
 * A shortcut's tile (RFC 0001 A6). Its link opens the shortcut's web address in a new tab, as it always did. When the shortcut has a native
 * app's address and the click comes from an installed core or a phone, that address is tried first; if no app comes forward within a
 * second, the web address opens after all. The app's address is never a link on the page: it is read here, when the tile is clicked.
 */
export function openShortcut(
  event: Click,
  shortcut: { url: string; appUrl?: string | undefined },
  deps: AppAddressDeps = browser,
): void {
  if (!shortcut.appUrl || !plainClick(event) || !(deps.installed() || deps.phone())) return;
  event.preventDefault();
  let left = false;
  const stop = deps.watch(() => {
    left = true;
  });
  deps.go(shortcut.appUrl);
  deps.later(() => {
    stop();
    if (!left) deps.open(shortcut.url);
  }, APP_ADDRESS_WAIT_MS);
}
