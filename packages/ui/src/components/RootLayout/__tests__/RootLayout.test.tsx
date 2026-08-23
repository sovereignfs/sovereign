// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RootLayout } from '../RootLayout';

let matches = false;

function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('RootLayout', () => {
  beforeEach(() => {
    matches = false;
    installMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('plain: renders the single child on web and mobile', () => {
    render(
      <RootLayout variant="plain">
        <span>Main</span>
      </RootLayout>,
    );
    expect(screen.getByText('Main')).toBeDefined();
    cleanup();

    matches = true;
    installMatchMedia();
    render(
      <RootLayout variant="plain">
        <span>Main</span>
      </RootLayout>,
    );
    expect(screen.getByText('Main')).toBeDefined();
  });

  it('sidebar: renders sidebar + main on web, main only on mobile', () => {
    render(
      <RootLayout variant="sidebar">
        <nav>Sidebar</nav>
        <main>Main</main>
      </RootLayout>,
    );
    expect(screen.getByText('Sidebar')).toBeDefined();
    expect(screen.getByText('Main')).toBeDefined();
    cleanup();

    matches = true;
    installMatchMedia();
    render(
      <RootLayout variant="sidebar">
        <nav>Sidebar</nav>
        <main>Main</main>
      </RootLayout>,
    );
    expect(screen.queryByText('Sidebar')).toBeNull();
    expect(screen.getByText('Main')).toBeDefined();
  });

  it('header: renders header + main identically on web and mobile', () => {
    render(
      <RootLayout variant="header">
        <header>Header</header>
        <main>Main</main>
      </RootLayout>,
    );
    expect(screen.getByText('Header')).toBeDefined();
    expect(screen.getByText('Main')).toBeDefined();
    cleanup();

    matches = true;
    installMatchMedia();
    render(
      <RootLayout variant="header">
        <header>Header</header>
        <main>Main</main>
      </RootLayout>,
    );
    expect(screen.getByText('Header')).toBeDefined();
    expect(screen.getByText('Main')).toBeDefined();
  });

  it('header: applies headerHeight on web and mobileHeaderHeight on mobile', () => {
    render(
      <RootLayout variant="header">
        <header>Header</header>
        <main>Main</main>
      </RootLayout>,
    );
    expect(screen.getByText('Header').parentElement?.style.height).toBe('48px');
    cleanup();

    matches = true;
    installMatchMedia();
    render(
      <RootLayout variant="header">
        <header>Header</header>
        <main>Main</main>
      </RootLayout>,
    );
    expect(screen.getByText('Header').parentElement?.style.height).toBe('60px');
  });

  it('shell: renders main only on web, header + main + footer on mobile', () => {
    render(
      <RootLayout variant="shell">
        <header>Header</header>
        <main>Main</main>
        <footer>Footer</footer>
      </RootLayout>,
    );
    expect(screen.queryByText('Header')).toBeNull();
    expect(screen.getByText('Main')).toBeDefined();
    expect(screen.queryByText('Footer')).toBeNull();
    cleanup();

    matches = true;
    installMatchMedia();
    render(
      <RootLayout variant="shell">
        <header>Header</header>
        <main>Main</main>
        <footer>Footer</footer>
      </RootLayout>,
    );
    expect(screen.getByText('Header')).toBeDefined();
    expect(screen.getByText('Main')).toBeDefined();
    expect(screen.getByText('Footer')).toBeDefined();
  });

  it('warns in development when the child count does not match the variant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <RootLayout variant="sidebar">
        <span>Only one child</span>
      </RootLayout>,
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('variant="sidebar"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expects 2'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('received 1'));

    warn.mockRestore();
  });
});
