// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEnvironment } from '../device-client';

function stubUserAgent(value: string): void {
  vi.stubGlobal('navigator', { userAgent: value });
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

describe('readEnvironment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects the mobile shell token', () => {
    stubUserAgent('Mozilla/5.0 (iPhone) Sovereign-Shell/mobile-ios 1.0.0');
    stubMatchMedia(false);

    expect(readEnvironment()).toEqual({ surface: 'mobile', installed: false });
  });

  it('detects the desktop shell token', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh) Sovereign-Shell/desktop-macos 2.0.0');
    stubMatchMedia(false);

    expect(readEnvironment()).toEqual({ surface: 'desktop', installed: false });
  });

  it('falls back to browser for an ordinary User-Agent', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    stubMatchMedia(false);

    expect(readEnvironment()).toEqual({ surface: 'browser', installed: false });
  });

  it('reports installed when running as a standalone PWA', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    stubMatchMedia(true);

    expect(readEnvironment()).toEqual({ surface: 'browser', installed: true });
  });
});
