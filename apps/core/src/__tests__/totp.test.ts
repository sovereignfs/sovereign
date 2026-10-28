import { describe, expect, it } from 'vitest';
import { base32Decode, secretOf, totp } from './totp';

// RFC 6238 appendix B: the secret is the ASCII string "12345678901234567890".
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('the test authenticator', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('agrees with RFC 6238 at %i seconds', (seconds, expected) => {
    expect(totp(RFC_SECRET, seconds * 1000, 8)).toBe(expected);
  });

  it('gives a six-digit code by default, the same within a 30 second step and different in the next', () => {
    const at = 1_700_000_010_000;
    expect(totp(RFC_SECRET, at)).toMatch(/^\d{6}$/);
    expect(totp(RFC_SECRET, at)).toBe(totp(RFC_SECRET, at + 5000));
    expect(totp(RFC_SECRET, at)).not.toBe(totp(RFC_SECRET, at + 31_000));
  });

  it('decodes base32', () => {
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
    expect(() => base32Decode('not base32!')).toThrow();
  });

  it('reads the secret from an otpauth address', () => {
    expect(
      secretOf(`otpauth://totp/Sovereign:ada@example.com?secret=${RFC_SECRET}&period=30`),
    ).toBe(RFC_SECRET);
    expect(() => secretOf('otpauth://totp/x')).toThrow();
  });
});
