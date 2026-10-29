// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_SCRIPT } from '../theme-script';

const THEMES = ['light', 'dark'] as const;

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
  document.head.innerHTML =
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">';
});
afterEach(() => vi.unstubAllGlobals());

describe('the pre-paint theme script', () => {
  it.each(THEMES)('follows the system’s %s scheme when nothing is saved', (system) => {
    run(system);
    expect(document.documentElement.dataset.theme).toBe(system);
  });

  it.each([
    ['dark', 'light'],
    ['light', 'dark'],
  ] as const)('puts a saved %s choice over a %s system', (saved, system) => {
    localStorage.setItem('sv-theme', saved);
    run(system);
    expect(document.documentElement.dataset.theme).toBe(saved);
  });

  it('leaves the theme-color tags alone, which the framework would not recognise changed and would add to', () => {
    localStorage.setItem('sv-theme', 'dark');
    run('light');
    const tag = document.querySelector('meta[name="theme-color"]');
    expect(tag?.getAttribute('content')).toBe('#ffffff');
    expect(tag?.getAttribute('media')).toBe('(prefers-color-scheme: light)');
  });

  it('ignores a saved value that is not a theme', () => {
    localStorage.setItem('sv-theme', 'purple');
    run('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
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
