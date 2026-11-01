import { ConfigError } from '@sovereignfs/config';
import { describe, expect, it } from 'vitest';
import { resolveAuthSettings } from '../auth/settings';
import { config } from '../config';

const BASE = {
  SV_URL: 'https://core.sovereign.local',
  SV_AUTH_SECRET: 'a-secret-that-is-long-enough-to-pass-validation',
};
const resolve = (env: Record<string, string> = {}) =>
  resolveAuthSettings(config.load({ ...BASE, ...env }));
const problems = (env: Record<string, string>) => {
  try {
    resolve(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.message;
    throw error;
  }
  throw new Error('expected a ConfigError');
};

describe('the authentication settings', () => {
  it('default to an eight-character policy with no required classes, on core’s own host', () => {
    expect(resolve()).toMatchObject({
      baseUrl: 'https://core.sovereign.local',
      trustedOrigins: [],
      trustedProxies: [],
      cookieDomain: undefined,
      secureCookies: true,
      passwordPolicy: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: false,
        requireLowercase: false,
        requireNumber: false,
        requireSymbol: false,
      },
    });
  });

  it('read the password policy from the environment', () => {
    expect(
      resolve({
        SV_AUTH_PASSWORD_MIN_LENGTH: '14',
        SV_AUTH_PASSWORD_REQUIRE_UPPERCASE: 'true',
        SV_AUTH_PASSWORD_REQUIRE_LOWERCASE: 'true',
        SV_AUTH_PASSWORD_REQUIRE_NUMBER: 'true',
        SV_AUTH_PASSWORD_REQUIRE_SYMBOL: 'true',
      }).passwordPolicy,
    ).toMatchObject({
      minLength: 14,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    });
  });

  it('use secure cookies exactly when core is served over https', () => {
    expect(resolve().secureCookies).toBe(true);
    expect(resolve({ SV_URL: 'http://localhost:3000' }).secureCookies).toBe(false);
    // However it is written: the proxy reads it too, and the cookie's name depends on the two agreeing.
    expect(resolve({ SV_URL: 'HTTPS://Core.Sovereign.local' }).secureCookies).toBe(true);
  });

  it('refuse a minimum length of 0 or beyond the longest password', () => {
    expect(problems({ SV_AUTH_PASSWORD_MIN_LENGTH: '0' })).toContain('SV_AUTH_PASSWORD_MIN_LENGTH');
    expect(problems({ SV_AUTH_PASSWORD_MIN_LENGTH: '129' })).toContain(
      'SV_AUTH_PASSWORD_MIN_LENGTH',
    );
  });

  describe('trusted origins', () => {
    it('accept origins and normalise them', () => {
      expect(
        resolve({ SV_AUTH_TRUSTED_ORIGINS: 'https://app.sovereign.local, http://localhost:4000/' })
          .trustedOrigins,
      ).toEqual(['https://app.sovereign.local', 'http://localhost:4000']);
    });

    it.each([
      'app.sovereign.local',
      'https://app.sovereign.local/path',
      'https://app.sovereign.local?x=1',
      'ftp://app.sovereign.local',
      'https://user:pw@app.sovereign.local',
    ])('refuse %s, and never print it', (entry) => {
      const message = problems({ SV_AUTH_TRUSTED_ORIGINS: entry });
      expect(message).toContain('SV_AUTH_TRUSTED_ORIGINS entry 1 must be an origin');
      expect(message).not.toContain('pw@');
    });
  });

  describe('trusted proxies', () => {
    it('accept addresses and ranges of both families', () => {
      expect(
        resolve({ SV_AUTH_TRUSTED_PROXIES: '10.0.0.0/8, 192.0.2.7, 2001:db8::/32, ::1' })
          .trustedProxies,
      ).toEqual(['10.0.0.0/8', '192.0.2.7', '2001:db8::/32', '::1']);
    });

    it.each([
      'proxy.sovereign.local',
      '10.0.0.0/33',
      '10.0.0.0/',
      '2001:db8::/129',
      '10.0.0.1/8/8',
    ])('refuse %s', (entry) => {
      expect(problems({ SV_AUTH_TRUSTED_PROXIES: entry })).toContain(
        'SV_AUTH_TRUSTED_PROXIES entry 1',
      );
    });
  });

  describe('the cookie domain', () => {
    it('is core’s own host or a parent of it', () => {
      expect(resolve({ SV_AUTH_COOKIE_DOMAIN: 'core.sovereign.local' }).cookieDomain).toBe(
        'core.sovereign.local',
      );
      expect(resolve({ SV_AUTH_COOKIE_DOMAIN: '.sovereign.local' }).cookieDomain).toBe(
        'sovereign.local',
      );
    });

    it('is refused when browsers would drop the cookie: another domain, a sibling, a child', () => {
      for (const domain of [
        'other.com',
        'app.sovereign.local',
        'ample.com',
        'deep.core.sovereign.local',
      ]) {
        expect(problems({ SV_AUTH_COOKIE_DOMAIN: domain }), domain).toContain(
          'SV_AUTH_COOKIE_DOMAIN',
        );
      }
    });

    it('is refused when it is not a domain at all', () => {
      expect(problems({ SV_AUTH_COOKIE_DOMAIN: 'https://sovereign.local' })).toContain(
        'must be a domain',
      );
      expect(problems({ SV_AUTH_COOKIE_DOMAIN: 'com' })).toContain('must be a domain');
    });
  });

  describe('the passkey relying party', () => {
    it('is core’s own host, the name Sovereign and core’s own address, when nothing is set', () => {
      expect(resolve().webauthn).toEqual({
        rpId: 'core.sovereign.local',
        rpName: 'Sovereign',
        origins: ['https://core.sovereign.local'],
      });
    });

    it('can be a parent domain the apps share, with core and an app both as origins', () => {
      expect(
        resolve({
          SV_AUTH_WEBAUTHN_RP_ID: 'Sovereign.local',
          SV_AUTH_WEBAUTHN_RP_NAME: ' Our Place ',
          SV_AUTH_WEBAUTHN_ORIGIN: 'https://core.sovereign.local, https://app.sovereign.local',
        }).webauthn,
      ).toEqual({
        rpId: 'sovereign.local',
        rpName: 'Our Place',
        origins: ['https://core.sovereign.local', 'https://app.sovereign.local'],
      });
    });

    it('is allowed on localhost over http, for development', () => {
      const local = resolveAuthSettings(
        config.load({
          ...BASE,
          SV_URL: 'http://localhost:3000',
          SV_AUTH_WEBAUTHN_ORIGIN: 'http://localhost:3000',
        }),
      );
      expect(local.webauthn.origins).toEqual(['http://localhost:3000']);
    });

    it.each([
      [
        'a domain that is not core’s host or a parent of it',
        { SV_AUTH_WEBAUTHN_RP_ID: 'other.com' },
        "core's own host or a parent",
      ],
      [
        'a subdomain of core’s host',
        { SV_AUTH_WEBAUTHN_RP_ID: 'deep.core.sovereign.local' },
        "core's own host or a parent",
      ],
      ['a URL', { SV_AUTH_WEBAUTHN_RP_ID: 'https://sovereign.local' }, 'must be a domain'],
      ['a leading dot', { SV_AUTH_WEBAUTHN_RP_ID: '.sovereign.local' }, 'must be a domain'],
    ])('refuses %s as the domain', (_name, env, words) => {
      expect(problems(env)).toContain(words);
    });

    it.each([
      ['a path', 'https://core.sovereign.local/sign-in', 'must be an origin'],
      ['not a URL', 'core.sovereign.local', 'must be an origin'],
      ['plain http away from localhost', 'http://core.sovereign.local', 'must be https'],
      ['a site outside the domain', 'https://evil.example', 'must be on core.sovereign.local'],
      ['a lookalike suffix', 'https://notcore.sovereign.local', 'must be on core.sovereign.local'],
    ])('refuses an origin that is %s', (_name, origin, words) => {
      expect(problems({ SV_AUTH_WEBAUTHN_ORIGIN: origin })).toContain(words);
    });

    it('checks an origin against the chosen domain, not core’s host', () => {
      expect(
        resolve({
          SV_AUTH_WEBAUTHN_RP_ID: 'sovereign.local',
          SV_AUTH_WEBAUTHN_ORIGIN: 'https://app.sovereign.local',
        }).webauthn.origins,
      ).toEqual(['https://app.sovereign.local']);
    });
  });

  it('report every problem at once', () => {
    const message = problems({
      SV_AUTH_TRUSTED_PROXIES: 'nope',
      SV_AUTH_TRUSTED_ORIGINS: 'nope',
      SV_AUTH_COOKIE_DOMAIN: 'other.com',
    });
    expect(message).toContain('3 problems');
  });
});
