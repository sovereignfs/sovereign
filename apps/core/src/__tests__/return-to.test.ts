import { describe, expect, it } from 'vitest';
import { safeReturnTo, signInReturnTo, withReturnTo } from '../auth/return-to';
import { resumeAddress } from '../oauth/signed-query';

describe('safeReturnTo', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeReturnTo('/settings?tab=mail#top')).toBe('/settings?tab=mail#top');
  });

  it('falls back to the home page when there is nothing', () => {
    expect(safeReturnTo(undefined)).toBe('/');
    expect(safeReturnTo('')).toBe('/');
  });

  it('takes the first of a repeated parameter', () => {
    expect(safeReturnTo(['/a', 'https://evil.example'])).toBe('/a');
  });

  it.each([
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'settings',
    '/\t/evil.example',
    '/\n/evil.example',
    `/${'a'.repeat(3000)}`,
  ])('refuses %j, which could leave this site', (value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});

/** A sign-in page's address as the provider makes it: the request, the names it signed, then `sig`. */
const signedPage = (request: Record<string, string>, extra: Record<string, string> = {}) => {
  const query = new URLSearchParams({ ...request, exp: '1', ba_iat: '1000' });
  for (const name of [...Object.keys(request), 'exp', 'ba_iat', 'ba_param'].sort()) {
    query.append('ba_param', name);
  }
  query.set('sig', 'signature');
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query;
};
const REQUEST = {
  client_id: 'app',
  redirect_uri: 'https://app.sovereign.local/auth/callback',
  response_type: 'code',
  scope: 'openid profile',
  state: 's1',
  code_challenge: 'c'.repeat(43),
  code_challenge_method: 'S256',
};

describe('resumeAddress', () => {
  it('is the app’s own request to the authorization endpoint, without what signed it', () => {
    const address = resumeAddress(signedPage(REQUEST)) as string;
    const url = new URL(address, 'https://core.sovereign.local');
    expect(url.pathname).toBe('/api/auth/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual(REQUEST);
  });

  it('leaves out what was added to the address and not signed', () => {
    const address = resumeAddress(signedPage(REQUEST, { returnTo: '/elsewhere', extra: 'x' }));
    expect(address).not.toContain('returnTo');
    expect(address).not.toContain('extra');
  });

  it('takes `login` out of `prompt`, since whoever opens it has just signed in', () => {
    const only = resumeAddress(signedPage({ ...REQUEST, prompt: 'login' })) as string;
    expect(new URL(only, 'https://x.local').searchParams.has('prompt')).toBe(false);
    const both = resumeAddress(signedPage({ ...REQUEST, prompt: 'login consent' })) as string;
    expect(new URL(both, 'https://x.local').searchParams.get('prompt')).toBe('consent');
  });

  it('takes `create` out of `prompt`, since whoever opens it has just made their account', () => {
    const only = resumeAddress(signedPage({ ...REQUEST, prompt: 'create' })) as string;
    expect(new URL(only, 'https://x.local').searchParams.has('prompt')).toBe(false);
    const both = resumeAddress(signedPage({ ...REQUEST, prompt: 'create consent' })) as string;
    expect(new URL(both, 'https://x.local').searchParams.get('prompt')).toBe('consent');
  });

  it('is nothing without a signed request, or without an app', () => {
    expect(resumeAddress(new URLSearchParams(REQUEST))).toBeUndefined();
    expect(resumeAddress(new URLSearchParams({ ...REQUEST, sig: 'x' }))).toBeUndefined();
    const { client_id: _client, ...noApp } = REQUEST;
    expect(resumeAddress(signedPage(noApp))).toBeUndefined();
  });

  it('is nothing when it would be too long to keep as a return address', () => {
    expect(resumeAddress(signedPage({ ...REQUEST, state: 's'.repeat(2100) }))).toBeUndefined();
  });
});

describe('signInReturnTo', () => {
  it('is the way back into the app’s sign-in when an app sent the person', () => {
    const query = Object.fromEntries(
      [...new Set(signedPage(REQUEST).keys())].map((key) => {
        const all = signedPage(REQUEST).getAll(key);
        return [key, all.length > 1 ? all : (all[0] as string)];
      }),
    );
    expect(signInReturnTo({ ...query, returnTo: '/settings' })).toBe(
      resumeAddress(signedPage(REQUEST)),
    );
  });

  it('is the page asked for otherwise', () => {
    expect(signInReturnTo({ returnTo: '/settings' })).toBe('/settings');
    expect(signInReturnTo({ returnTo: 'https://evil.example' })).toBe('/');
  });
});

describe('withReturnTo', () => {
  it('passes the return address along, and nothing for the home page', () => {
    expect(withReturnTo('/forgot-password', '/')).toBe('/forgot-password');
    expect(withReturnTo('/forgot-password', '/a?b=1')).toBe(
      '/forgot-password?returnTo=%2Fa%3Fb%3D1',
    );
    expect(withReturnTo('/sign-in?reset=1', '/a')).toBe('/sign-in?reset=1&returnTo=%2Fa');
  });
});
