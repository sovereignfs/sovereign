import { describe, expect, it } from 'vitest';
import { deviceHint } from '../device-hint';

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
};

describe('deviceHint', () => {
  it('returns "Unknown device" for null/empty', () => {
    expect(deviceHint(null)).toBe('Unknown device');
    expect(deviceHint(undefined)).toBe('Unknown device');
    expect(deviceHint('')).toBe('Unknown device');
  });

  it('detects Chrome on macOS', () => {
    expect(deviceHint(UA.chromeMac)).toBe('Chrome on macOS');
  });

  it('detects Edge over Chrome (Edge UA also contains Chrome/)', () => {
    expect(deviceHint(UA.edgeWin)).toBe('Edge on Windows');
  });

  it('detects Firefox on Linux', () => {
    expect(deviceHint(UA.firefoxLinux)).toBe('Firefox on Linux');
  });

  it('detects Safari on iOS (iPhone UA precedence over the Mac token)', () => {
    expect(deviceHint(UA.safariIphone)).toBe('Safari on iOS');
  });

  it('detects Chrome on Android (Android precedence over the Linux token)', () => {
    expect(deviceHint(UA.chromeAndroid)).toBe('Chrome on Android');
  });

  it('falls back gracefully for an unrecognised UA', () => {
    expect(deviceHint('curl/8.4.0')).toBe('Browser on Unknown OS');
  });
});
