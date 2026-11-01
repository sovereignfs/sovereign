import { describe, expect, it } from 'vitest';
import { continuationUrl, isContinuation } from '../auth/oauth-continuation';

describe('isContinuation', () => {
  it.each([
    ['?client_id=a&sig=abc', true],
    ['client_id=a&sig=abc', true],
    ['?sig=', true],
    ['?returnTo=%2Fsettings', false],
    ['', false],
    ['?signature=abc', false],
    ['?client_id=a', false],
  ])('reads %j as %s', (search, expected) => {
    expect(isContinuation(search)).toBe(expected);
  });
});

describe('continuationUrl', () => {
  it('is the address the provider says to go to', () => {
    expect(
      continuationUrl({ redirect: true, url: 'https://rp.sovereign.local/cb?code=abc&state=1' }),
    ).toBe('https://rp.sovereign.local/cb?code=abc&state=1');
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['text', 'https://rp.sovereign.local'],
    ['no address', { redirect: true }],
    ['an empty address', { redirect: true, url: '' }],
    ['an address but no redirect', { url: 'https://rp.sovereign.local/cb' }],
    ['redirect false', { redirect: false, url: 'https://rp.sovereign.local/cb' }],
    ['redirect as text', { redirect: 'true', url: 'https://rp.sovereign.local/cb' }],
    ['an address that is not text', { redirect: true, url: 5 }],
    ['an ordinary sign-in answer', { session: { id: 's1' }, user: { id: 'u1' } }],
  ])('is nothing for %s', (_name, data) => {
    expect(continuationUrl(data)).toBeUndefined();
  });
});
