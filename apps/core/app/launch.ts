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

const browser: LaunchDeps = {
  installed: isInstalledDisplay,
  open: (url) => {
    window.open(url, '_blank', 'noopener');
  },
};

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
