import { describe, expect, it } from 'vitest';
import { applySurfaceHeaders, resolveSurface } from '../surface';

describe('resolveSurface', () => {
  it('resolves the mobile shell token', () => {
    expect(resolveSurface('Mozilla/5.0 (iPhone) Sovereign-Shell/mobile-ios 1.0.0')).toEqual({
      surface: 'mobile',
      shellVersion: '1.0.0',
      focusPlugin: null,
    });
  });

  it('resolves the desktop shell token', () => {
    expect(resolveSurface('Mozilla/5.0 (Macintosh) Sovereign-Shell/desktop-macos 2.3.1')).toEqual({
      surface: 'desktop',
      shellVersion: '2.3.1',
      focusPlugin: null,
    });
  });

  it('resolves an ordinary browser User-Agent to browser', () => {
    expect(
      resolveSurface(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toEqual({ surface: 'browser', shellVersion: null, focusPlugin: null });
  });

  it('resolves a null User-Agent to browser', () => {
    expect(resolveSurface(null)).toEqual({
      surface: 'browser',
      shellVersion: null,
      focusPlugin: null,
    });
  });

  it('resolves an unrecognized shell token to browser', () => {
    expect(resolveSurface('Sovereign-Shell/tablet-fridge 1.0.0')).toEqual({
      surface: 'browser',
      shellVersion: null,
      focusPlugin: null,
    });
  });

  it('does not match a version-less token', () => {
    expect(resolveSurface('Sovereign-Shell/mobile-ios')).toEqual({
      surface: 'browser',
      shellVersion: null,
      focusPlugin: null,
    });
  });

  it('resolves a focused mobile shell token (RFC 0082)', () => {
    expect(
      resolveSurface(
        'Mozilla/5.0 (iPhone) Sovereign-Shell/mobile-ios 1.0.0 (focus=fs.sovereign.tally)',
      ),
    ).toEqual({ surface: 'mobile', shellVersion: '1.0.0', focusPlugin: 'fs.sovereign.tally' });
  });

  it('resolves a focused desktop shell token (RFC 0082)', () => {
    expect(
      resolveSurface(
        'Mozilla/5.0 (Macintosh) Sovereign-Shell/desktop-macos 2.3.1 (focus=fs.sovereign.tally)',
      ),
    ).toEqual({ surface: 'desktop', shellVersion: '2.3.1', focusPlugin: 'fs.sovereign.tally' });
  });

  it('resolves focusPlugin to null for the unfocused (whole-instance) shell token', () => {
    expect(resolveSurface('Sovereign-Shell/mobile-android 1.2.3').focusPlugin).toBeNull();
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

  it('sets x-sovereign-focus-plugin for a focused shell token (RFC 0082)', () => {
    const headers = new Headers();
    applySurfaceHeaders(headers, 'Sovereign-Shell/mobile-ios 1.0.0 (focus=fs.sovereign.tally)');
    expect(headers.get('x-sovereign-focus-plugin')).toBe('fs.sovereign.tally');
  });

  it('omits x-sovereign-focus-plugin for an unfocused shell token', () => {
    const headers = new Headers();
    applySurfaceHeaders(headers, 'Sovereign-Shell/mobile-ios 1.0.0');
    expect(headers.get('x-sovereign-focus-plugin')).toBeNull();
  });

  it('strips a forged inbound x-sovereign-focus-plugin when the real request has none', () => {
    const headers = new Headers({ 'x-sovereign-focus-plugin': 'fs.sovereign.console' });
    applySurfaceHeaders(headers, 'Mozilla/5.0');
    expect(headers.get('x-sovereign-focus-plugin')).toBeNull();
  });

  it('overwrites a forged inbound x-sovereign-focus-plugin with the real focus target', () => {
    const headers = new Headers({ 'x-sovereign-focus-plugin': 'fs.sovereign.console' });
    applySurfaceHeaders(headers, 'Sovereign-Shell/mobile-ios 1.0.0 (focus=fs.sovereign.tally)');
    expect(headers.get('x-sovereign-focus-plugin')).toBe('fs.sovereign.tally');
  });
});
