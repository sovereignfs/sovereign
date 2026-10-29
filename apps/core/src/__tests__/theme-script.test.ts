// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_COLORS } from '../pwa';
import { THEME_SCRIPT } from '../theme-script';

const bars = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((tag) => [
    tag.getAttribute('media'),
    tag.getAttribute('content'),
  ]);

/** Runs the script as a browser does, with the system's colour scheme as given. */
function run(system: 'light' | 'dark') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: system === 'dark' && query.includes('dark'),
  }));
  new Function(THEME_SCRIPT)();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}">`;
});
afterEach(() => vi.unstubAllGlobals());

describe('the pre-paint theme script', () => {
  it.each(['light', 'dark'] as const)(
    'follows the system’s %s scheme when nothing is saved',
    (system) => {
      run(system);
      expect(document.documentElement.dataset.theme).toBe(system);
    },
  );

  it('leaves the browser’s bar to the system’s scheme when nothing is saved', () => {
    run('dark');
    expect(bars()).toEqual([
      ['(prefers-color-scheme: light)', THEME_COLORS.light],
      ['(prefers-color-scheme: dark)', THEME_COLORS.dark],
    ]);
  });

  it.each([
    ['dark', 'light', THEME_COLORS.dark],
    ['light', 'dark', THEME_COLORS.light],
  ] as const)(
    'puts a saved %s choice over a %s system, in the page and in the browser’s bar',
    (saved, system, color) => {
      localStorage.setItem('sv-theme', saved);
      run(system);
      expect(document.documentElement.dataset.theme).toBe(saved);
      expect(bars()).toEqual([
        [null, color],
        [null, color],
      ]);
    },
  );

  it('does it again once the page is read, for tags that come after the script', () => {
    document.head.innerHTML = '';
    localStorage.setItem('sv-theme', 'dark');
    run('light');
    document.head.innerHTML = `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}">`;
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(bars()).toEqual([[null, THEME_COLORS.dark]]);
  });

  it('ignores a saved value that is not a theme', () => {
    localStorage.setItem('sv-theme', 'purple');
    run('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(bars()[0]).toEqual(['(prefers-color-scheme: light)', THEME_COLORS.light]);
  });

  it('falls back to light when the browser will not say', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
