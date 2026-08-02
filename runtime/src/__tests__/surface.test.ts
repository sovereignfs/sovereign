import { describe, expect, it } from 'vitest';
import { applySurfaceHeaders, resolveSurface } from '../surface';

describe('resolveSurface', () => {
  it('resolves the mobile shell token', () => {
    expect(resolveSurface('Mozilla/5.0 (iPhone) Sovereign-Shell/mobile-ios 1.0.0')).toEqual({
      surface: 'mobile',
      shellVersion: '1.0.0',
    });
  });

  it('resolves the desktop shell token', () => {
    expect(resolveSurface('Mozilla/5.0 (Macintosh) Sovereign-Shell/desktop-macos 2.3.1')).toEqual({
      surface: 'desktop',
      shellVersion: '2.3.1',
    });
  });

  it('resolves an ordinary browser User-Agent to browser', () => {
    expect(
      resolveSurface(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toEqual({ surface: 'browser', shellVersion: null });
  });

  it('resolves a null User-Agent to browser', () => {
    expect(resolveSurface(null)).toEqual({ surface: 'browser', shellVersion: null });
  });

  it('resolves an unrecognized shell token to browser', () => {
    expect(resolveSurface('Sovereign-Shell/tablet-fridge 1.0.0')).toEqual({
      surface: 'browser',
      shellVersion: null,
    });
  });

  it('does not match a version-less token', () => {
    expect(resolveSurface('Sovereign-Shell/mobile-ios')).toEqual({
      surface: 'browser',
      shellVersion: null,
    });
  });
});

describe('applySurfaceHeaders', () => {
  it('sets surface and version for a recognized shell token', () => {
    const headers = new Headers();
    applySurfaceHeaders(headers, 'Sovereign-Shell/mobile-android 1.2.3');
    expect(headers.get('x-sovereign-surface')).toBe('mobile');
    expect(headers.get('x-sovereign-shell-version')).toBe('1.2.3');
  });

  it('sets browser and omits version for an ordinary User-Agent', () => {
    const headers = new Headers();
    applySurfaceHeaders(headers, 'Mozilla/5.0');
    expect(headers.get('x-sovereign-surface')).toBe('browser');
    expect(headers.get('x-sovereign-shell-version')).toBeNull();
  });

  it('overwrites a forged inbound x-sovereign-surface header', () => {
    const headers = new Headers({ 'x-sovereign-surface': 'desktop' });
    applySurfaceHeaders(headers, 'Mozilla/5.0');
    expect(headers.get('x-sovereign-surface')).toBe('browser');
  });

  it('strips a forged inbound x-sovereign-shell-version when the real request has none', () => {
    const headers = new Headers({ 'x-sovereign-shell-version': '99.99.99' });
    applySurfaceHeaders(headers, 'Mozilla/5.0');
    expect(headers.get('x-sovereign-shell-version')).toBeNull();
  });
});
