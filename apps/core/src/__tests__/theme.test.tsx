// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_COLORS } from '../pwa';
import { paintTheme, readThemeChoice, resolveTheme, setThemeChoice, THEME_KEY } from '../theme';

const { AppearanceChoice } = await import('../../app/preferences/appearance-choice');
const { ThemeWatcher } = await import('../../app/theme-watcher');

/** A system whose colour scheme can be changed, and whose listeners are kept. */
function system(initial: 'light' | 'dark') {
  let dark = initial === 'dark';
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return dark && query.includes('dark');
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    change(next: 'light' | 'dark') {
      dark = next === 'dark';
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
}

const bars = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((tag) => [
    tag.getAttribute('media'),
    tag.getAttribute('content'),
  ]);
const theme = () => document.documentElement.dataset.theme;
const OWN_BARS = [
  ['(prefers-color-scheme: light)', THEME_COLORS.light],
  ['(prefers-color-scheme: dark)', THEME_COLORS.dark],
];

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}">`;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the theme a person chooses', () => {
  it('is the system’s when nothing is saved, or what is saved is not a choice', () => {
    expect(readThemeChoice()).toBe('system');
    localStorage.setItem(THEME_KEY, 'purple');
    expect(readThemeChoice()).toBe('system');
  });

  it.each(['light', 'dark'] as const)('is %s when that is saved', (saved) => {
    localStorage.setItem(THEME_KEY, saved);
    expect(readThemeChoice()).toBe(saved);
  });

  it('is the system’s when the browser will not say', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readThemeChoice()).toBe('system');
  });

  it.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
  ] as const)('comes to the theme: %s on a %s system is %s', (choice, os, expected) => {
    system(os);
    expect(resolveTheme(choice)).toBe(expected);
  });

  it.each(['light', 'dark'] as const)(
    'is kept, and drawn, with the browser’s bar in its colour: %s',
    (choice) => {
      system(choice === 'light' ? 'dark' : 'light');
      setThemeChoice(choice);
      expect(localStorage.getItem(THEME_KEY)).toBe(choice);
      expect(theme()).toBe(choice);
      expect(bars()).toEqual([
        [null, THEME_COLORS[choice]],
        [null, THEME_COLORS[choice]],
      ]);
    },
  );

  it('is forgotten for the system’s, which draws the page in the system’s theme and the bar by its scheme again', () => {
    system('dark');
    setThemeChoice('light');
    setThemeChoice('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(theme()).toBe('dark');
    expect(bars()).toEqual(OWN_BARS);
  });

  it('is still drawn when the browser will not keep it', () => {
    system('light');
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    });
    expect(() => setThemeChoice('dark')).not.toThrow();
    expect(theme()).toBe('dark');
  });
});

describe('the Appearance choice in Preferences', () => {
  it('offers light, dark and system, and shows the one in force', async () => {
    system('light');
    localStorage.setItem(THEME_KEY, 'dark');
    render(<AppearanceChoice />);
    const radios = await screen.findAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Light', 'Dark', 'System']);
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeTruthy();
  });

  it('starts on System for someone who has chosen nothing', async () => {
    system('dark');
    render(<AppearanceChoice />);
    expect(
      (await screen.findByRole('radio', { name: 'System' })).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('applies a choice as it is made, with nothing to save, and says what it will do', async () => {
    system('light');
    render(<AppearanceChoice />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(theme()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(screen.getByText(/Always dark on this device/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(theme()).toBe('light');
    expect(screen.getByText(/Follows your device/)).toBeTruthy();
  });
});

describe('the theme watcher', () => {
  it('gives the browser’s bar the colour of a saved choice once the page is ready, and leaves it for the system’s', () => {
    system('light');
    localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeWatcher />);
    expect(bars()).toEqual([
      [null, THEME_COLORS.dark],
      [null, THEME_COLORS.dark],
    ]);
    cleanup();
    localStorage.clear();
    document.head
      .querySelectorAll('meta')
      .forEach((tag, at) => tag.setAttribute('content', at ? 'x' : 'y'));
    render(<ThemeWatcher />);
    expect(bars().map(([, color]) => color)).toEqual(['y', 'x']);
  });

  it('follows the system while the choice is system, and leaves a chosen theme alone', () => {
    const os = system('light');
    render(<ThemeWatcher />);
    paintTheme('system');
    act(() => os.change('dark'));
    expect(theme()).toBe('dark');
    setThemeChoice('light');
    act(() => os.change('dark'));
    expect(theme()).toBe('light');
  });

  it('follows a choice made in another tab', () => {
    system('light');
    render(<ThemeWatcher />);
    localStorage.setItem(THEME_KEY, 'dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }));
    });
    expect(theme()).toBe('dark');
    localStorage.removeItem(THEME_KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }));
    });
    expect(theme()).toBe('light');
  });

  it('stops listening when it goes', () => {
    const os = system('light');
    const { unmount } = render(<ThemeWatcher />);
    expect(os.listeners.size).toBe(1);
    unmount();
    expect(os.listeners.size).toBe(0);
  });
});
