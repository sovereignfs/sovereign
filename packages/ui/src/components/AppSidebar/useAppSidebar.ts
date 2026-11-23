'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  parseSidebarStored,
  type SidebarState,
  sidebarStateFor,
  sidebarStorageKey,
  type SidebarStored,
  toggleSidebarHidden,
  toggleSidebarRail,
} from './sidebar-state';

const EVENT = 'sv:sidebar';

/** The stored text, or null: a private window, blocked site data and a browser with no storage all read as nothing. */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export interface AppSidebarControl {
  /** How the sidebar is shown here. Always `hidden` on a phone, whose navigation is a drawer. */
  state: SidebarState;
  /** Whether there is a sidebar to show at this width (not on a phone). */
  available: boolean;
  /** The header's button: hides it, or shows it again as it was. */
  toggleHidden(): void;
  /** The sidebar's own button: full to a rail and back. */
  toggleRail(): void;
}

/**
 * How an app's sidebar is shown on a kind of page, on this device. The server and the first paint show the default, so that the
 * two agree; what the person chose before is read in an effect straight after, and a change in another tab is followed.
 */
export function useAppSidebar(
  appId: string,
  pageKind: string,
  fallback: SidebarState = 'full',
): AppSidebarControl {
  const key = sidebarStorageKey(appId);
  const mobile = useIsMobile();
  const [stored, setStored] = useState<SidebarStored>({});

  useEffect(() => {
    const load = () => setStored(parseSidebarStored(read(key)));
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) load();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(EVENT, load);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(EVENT, load);
    };
  }, [key]);

  const write = useCallback(
    (change: (now: SidebarStored) => SidebarStored) => {
      const next = change(parseSidebarStored(read(key)));
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not kept: it holds for this page view, and the default is back at the next.
      }
      setStored(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return {
    state: mobile ? 'hidden' : sidebarStateFor(pageKind, stored, fallback),
    available: !mobile,
    toggleHidden: () => write((now) => toggleSidebarHidden(pageKind, now, fallback)),
    toggleRail: () => write((now) => toggleSidebarRail(pageKind, now, fallback)),
  };
}
