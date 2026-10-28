import { describe, expect, it } from 'vitest';
import { describeAddress, describeDevice } from '../sessions/device';

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome on macOS',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      'Safari on macOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Firefox on Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.37 Mobile/15E148 Safari/604.1',
      'Chrome on iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0', 'Firefox on Linux'],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome on ChromeOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
      'Opera on Windows',
    ],
    ['curl/8.7.1', 'curl'],
  ])('says %j as %s', (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it.each([undefined, null, '', '   '])('says %j is an unknown device', (userAgent) => {
    expect(describeDevice(userAgent)).toBe('Unknown device');
  });

  it('says only what it can tell, and does not guess', () => {
    expect(describeDevice('SomeBot/1.0')).toBe('Unknown device');
    expect(describeDevice('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
  });

  it('does not let a user agent that is made up turn into markup or a long label', () => {
    expect(describeDevice('<script>alert(1)</script>'.repeat(50))).toBe('Unknown device');
  });
});

describe('describeAddress', () => {
  it.each([
    ['203.0.113.5', '203.0.113.5'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:0db8:0001:0000:0000:0002:0000:0003', '2001:db8:1::2:0:3'],
    ['2001:0db8:0000:0001:0002:0003:0004:0005', '2001:db8:0:1:2:3:4:5'],
    ['fe80:0000:0000:0000:0000:0000:0000:0000', 'fe80::'],
    ['not an address:', 'not an address:'],
  ])('shows %s as %s', (given, shown) => {
    expect(describeAddress(given)).toBe(shown);
  });

  it.each([null, undefined, '', '127.0.0.1', '::1', '0000:0000:0000:0000:0000:0000:0000:0000'])(
    'leaves out %s, which says nothing about where someone is',
    (given) => {
      expect(describeAddress(given)).toBeNull();
    },
  );
});
