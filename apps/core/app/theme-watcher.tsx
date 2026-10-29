'use client';

import { useEffect } from 'react';
import { paintTheme, readThemeChoice, THEME_KEY } from '../src/theme';

/**
 * Keeps the page's theme in step with what decides it after the page has loaded: the system's colour scheme, while the
 * person has chosen "system", and a choice made in another tab of the same browser. The first paint is the pre-paint
 * script's; this gives the browser's bar the colour of a saved choice once the page is ready, and follows changes.
 */
export function ThemeWatcher() {
  useEffect(() => {
    // The browser's bar takes the colour of a saved choice now that the page is ready: before it, the framework's own
    // tags would not be recognised, and it would add others.
    const saved = readThemeChoice();
    if (saved !== 'system') paintTheme(saved);
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    const follow = () => {
      if (readThemeChoice() === 'system') paintTheme('system');
    };
    const elsewhere = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) paintTheme(readThemeChoice());
    };
    scheme.addEventListener('change', follow);
    window.addEventListener('storage', elsewhere);
    return () => {
      scheme.removeEventListener('change', follow);
      window.removeEventListener('storage', elsewhere);
    };
  }, []);
  return null;
}
