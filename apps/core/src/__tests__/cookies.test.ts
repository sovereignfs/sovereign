import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  advancedCookieOptions,
  cookieName,
  namePrefix,
  removalAttributes,
  sessionCacheCookieNames,
  sessionCookieName,
} from '../auth/cookies';

describe('which prefix a cookie has', () => {
  it.each([
    ['over https on its own host', { secure: true, domain: undefined }, '__Host-'],
    [
      'over https with a cookie domain, shared with subdomains',
      { secure: true, domain: 'example.com' },
      '__Secure-',
    ],
    ['over http', { secure: false, domain: undefined }, ''],
    ['over http with a cookie domain', { secure: false, domain: 'example.com' }, ''],
  ] as const)('%s', (_, policy, prefix) => {
    expect(namePrefix(policy)).toBe(prefix);
    expect(sessionCookieName(policy)).toBe(`${prefix}better-auth.session_token`);
    expect(cookieName(policy, 'dont_remember')).toBe(`${prefix}better-auth.dont_remember`);
  });
});

describe('what better-auth is told', () => {
  it('turns its own prefix off for a host-only cookie, and names and secures it by hand', () => {
    expect(advancedCookieOptions({ secure: true, domain: undefined })).toEqual({
      useSecureCookies: false,
      cookiePrefix: '__Host-better-auth',
      defaultCookieAttributes: { secure: true },
    });
  });

  it.each([
    [{ secure: true, domain: 'example.com' }, true],
    [{ secure: false, domain: undefined }, false],
    [{ secure: false, domain: 'example.com' }, false],
  ] as const)('leaves its own prefix to it for %j', (policy, secure) => {
    expect(advancedCookieOptions(policy)).toEqual({ useSecureCookies: secure });
  });
});

it('clears the session cache cookie under every name it can have', () => {
  expect(sessionCacheCookieNames()).toEqual([
    'better-auth.session_data',
    '__Secure-better-auth.session_data',
    '__Host-better-auth.session_data',
  ]);
});

describe('removing a cookie', () => {
  it('is Secure for a prefixed name, and never gives a __Host- cookie a domain', () => {
    expect(removalAttributes('__Host-better-auth.x', 'example.com')).toEqual({
      maxAge: 0,
      path: '/',
      secure: true,
    });
    expect(removalAttributes('__Secure-better-auth.x', 'example.com')).toEqual({
      maxAge: 0,
      path: '/',
      secure: true,
      domain: 'example.com',
    });
    expect(removalAttributes('better-auth.x', 'example.com')).toEqual({
      maxAge: 0,
      path: '/',
      domain: 'example.com',
    });
    expect(removalAttributes('better-auth.x', undefined)).toEqual({ maxAge: 0, path: '/' });
  });
});

// The names are decided in one place. A file that spells one out can drift from it, and a session cookie named
// wrongly in the proxy signs everybody out of the pages, or lets a planted cookie through the first check.
describe('where a cookie is named', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const file = path.join(dir, entry);
      if (statSync(file).isDirectory()) {
        return ['__tests__', 'node_modules', '.next'].includes(entry) ? [] : sources(file);
      }
      return /\.tsx?$/.test(entry) ? [file] : [];
    });

  it('is src/auth/cookies.ts alone, outside the tests', () => {
    const files = [
      ...sources(path.join(root, 'src')),
      ...sources(path.join(root, 'app')),
      path.join(root, 'proxy.ts'),
    ].filter((file) => !file.endsWith(path.join('auth', 'cookies.ts')));
    expect(files.length).toBeGreaterThan(50);
    // Code only: a comment that explains the rule does not name a cookie.
    const code = (file: string) =>
      readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
    const naming = files.filter((file) =>
      /better-auth\.(session_token|session_data)|__Host-|__Secure-/.test(code(file)),
    );
    expect(naming.map((file) => path.relative(root, file))).toEqual([]);
  });
});
