import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_BYTES, isValidTheme, isValidTimezone, validateAvatar } from '../account';

describe('isValidTheme', () => {
  it('accepts the three known themes', () => {
    expect(isValidTheme('system')).toBe(true);
    expect(isValidTheme('light')).toBe(true);
    expect(isValidTheme('dark')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidTheme('blue')).toBe(false);
    expect(isValidTheme('')).toBe(false);
    expect(isValidTheme(null)).toBe(false);
    expect(isValidTheme(undefined)).toBe(false);
  });
});

describe('isValidTimezone', () => {
  it('accepts IANA zones', () => {
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('Europe/Berlin')).toBe(true);
    expect(isValidTimezone('Asia/Colombo')).toBe(true);
  });

  it('rejects unknown or malformed zones', () => {
    expect(isValidTimezone('Mars/Phobos')).toBe(false);
    expect(isValidTimezone('not a zone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });
});

describe('validateAvatar', () => {
  it('accepts JPEG/PNG/WebP within the size limit and maps the extension', () => {
    expect(validateAvatar('image/jpeg', 1000)).toEqual({ ok: true, ext: 'jpg' });
    expect(validateAvatar('image/png', 1000)).toEqual({ ok: true, ext: 'png' });
    expect(validateAvatar('image/webp', 1000)).toEqual({ ok: true, ext: 'webp' });
  });

  it('rejects unsupported types', () => {
    expect(validateAvatar('image/gif', 1000).ok).toBe(false);
    expect(validateAvatar('application/pdf', 1000).ok).toBe(false);
    expect(validateAvatar(null, 1000).ok).toBe(false);
  });

  it('rejects empty and oversized files', () => {
    expect(validateAvatar('image/png', 0).ok).toBe(false);
    expect(validateAvatar('image/png', AVATAR_MAX_BYTES + 1).ok).toBe(false);
    expect(validateAvatar('image/png', AVATAR_MAX_BYTES).ok).toBe(true);
  });
});
