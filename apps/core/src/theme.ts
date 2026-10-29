import { THEME_COLORS } from './pwa';

/**
 * The appearance a person chooses for core on this device: light, dark, or whatever their system says. It is kept
 * in this browser and nowhere else (`localStorage`, the key the pre-paint script in `theme-script.ts` reads), because
 * it is about the screen in front of them, not about who they are, and no app they sign in to needs it. "System" is
 * the absence of a saved choice.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_KEY = 'sv-theme';

export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

/** What is saved, or `system` when nothing is, or what is there is not a choice (or the browser will not say). */
export function readThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

const systemIsDark = (): boolean => matchMedia('(prefers-color-scheme: dark)').matches;

/** The theme a choice comes to, now. */
export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (systemIsDark() ? 'dark' : 'light') : choice;
}

/**
 * Draws the page in a choice: the theme, and the browser's bar. With a saved choice both `theme-color` tags take its
 * colour; with the system's, they follow the system's scheme again, as they were made to.
 */
export function paintTheme(choice: ThemeChoice): void {
  document.documentElement.dataset.theme = resolveTheme(choice);
  const bars = document.querySelectorAll('meta[name="theme-color"]');
  if (choice === 'system') {
    const own = [
      ['(prefers-color-scheme: light)', THEME_COLORS.light],
      ['(prefers-color-scheme: dark)', THEME_COLORS.dark],
    ] as const;
    bars.forEach((bar, at) => {
      const [media, color] = own[Math.min(at, own.length - 1)] ?? own[0];
      bar.setAttribute('media', media);
      bar.setAttribute('content', color);
    });
    return;
  }
  bars.forEach((bar) => {
    bar.removeAttribute('media');
    bar.setAttribute('content', THEME_COLORS[choice]);
  });
}

/** Saves a choice (or forgets one, for the system's) and draws the page in it. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // A browser that will not keep it still draws it, until the page is left.
  }
  paintTheme(choice);
}
