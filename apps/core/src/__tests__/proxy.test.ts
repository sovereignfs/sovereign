import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadProxy(url: string, cookieDomain?: string) {
  vi.resetModules();
  vi.stubEnv('SV_URL', url);
  if (cookieDomain !== undefined) vi.stubEnv('SV_AUTH_COOKIE_DOMAIN', cookieDomain);
  return import('../../proxy');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const SIGNED_IN = { cookie: 'better-auth.session_token=anything' };
const signedIn = (url: string) => new NextRequest(url, { headers: SIGNED_IN });

function nonceOf(csp: string): string {
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  if (!nonce) throw new Error(`no nonce in: ${csp}`);
  return nonce;
}

describe('proxy', () => {
  it('puts the Content Security Policy on the response', async () => {
    const { proxy } = await loadProxy('http://localhost:3000');
    const csp = proxy(signedIn('http://localhost:3000/')).headers.get('content-security-policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('uses a fresh nonce for every request', async () => {
    const { proxy } = await loadProxy('http://localhost:3000');
    const nonces = new Set(
      Array.from({ length: 50 }, () =>
        nonceOf(
          proxy(signedIn('http://localhost:3000/')).headers.get('content-security-policy') ?? '',
        ),
      ),
    );
    expect(nonces.size).toBe(50);
  });

  it('hands the same nonce and policy to the page through the request', async () => {
    const { proxy } = await loadProxy('http://localhost:3000');
    const response = proxy(signedIn('http://localhost:3000/'));
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(csp));
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('does not let a caller choose the nonce', async () => {
    const { proxy } = await loadProxy('http://localhost:3000');
    const request = new NextRequest('http://localhost:3000/', {
      headers: {
        ...SIGNED_IN,
        'x-nonce': 'attacker',
        'content-security-policy': "script-src 'unsafe-inline'",
      },
    });
    const response = proxy(request);
    expect(response.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
    expect(response.headers.get('content-security-policy')).not.toContain('attacker');
  });

  it('asks for the https upgrade only when core is served over https', async () => {
    const insecure = await loadProxy('http://localhost:3000');
    expect(
      insecure.proxy(signedIn('http://localhost:3000/')).headers.get('content-security-policy'),
    ).not.toContain('upgrade-insecure-requests');
    const secure = await loadProxy('https://core.example.com');
    expect(
      secure.proxy(signedIn('https://core.example.com/')).headers.get('content-security-policy'),
    ).toContain('upgrade-insecure-requests');
  });

  it('lets only the launcher show pictures from other addresses', async () => {
    const { proxy } = await loadProxy('https://core.example.com');
    const imgSrc = (path: string) =>
      /img-src ([^;]*)/.exec(
        proxy(signedIn(`https://core.example.com${path}`)).headers.get('content-security-policy') ??
          '',
      )?.[1];
    expect(imgSrc('/')).toBe("'self' blob: data: https:");
    for (const path of [
      '/profile',
      '/console',
      '/console/apps',
      '/consent',
      '/api/health',
      '/sign-in',
    ]) {
      expect(imgSrc(path)).toBe("'self' blob: data:");
    }
  });

  describe('security headers', () => {
    const NAMES = [
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
    ];

    it('puts them on a page, on a redirect to sign-in, and on a static file', async () => {
      const { proxy } = await loadProxy('http://localhost:3000');
      for (const response of [
        proxy(signedIn('http://localhost:3000/')),
        proxy(new NextRequest('http://localhost:3000/profile')),
        proxy(signedIn('http://localhost:3000/_next/static/chunks/app.js')),
      ]) {
        for (const name of NAMES) expect(response.headers.get(name), name).not.toBeNull();
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('x-frame-options')).toBe('DENY');
      }
    });

    it('says nothing about the camera, a payment or a location is allowed, and leaves passkeys alone', async () => {
      const { proxy } = await loadProxy('http://localhost:3000');
      const policy =
        proxy(signedIn('http://localhost:3000/')).headers.get('permissions-policy') ?? '';
      for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
        expect(policy).toContain(`${feature}=()`);
      }
      expect(policy).not.toContain('publickey-credentials');
    });

    it('asks for https for a year only when core is served over https', async () => {
      const insecure = await loadProxy('http://localhost:3000');
      expect(
        insecure.proxy(signedIn('http://localhost:3000/')).headers.get('strict-transport-security'),
      ).toBeNull();
      const secure = await loadProxy('https://core.example.com');
      for (const request of [
        signedIn('https://core.example.com/'),
        new NextRequest('https://core.example.com/profile'),
      ]) {
        expect(secure.proxy(request).headers.get('strict-transport-security')).toBe(
          'max-age=31536000',
        );
      }
    });
  });

  it('matches every path, so API routes and static files carry the policy too', async () => {
    const { config } = await loadProxy('http://localhost:3000');
    expect(config.matcher).toBe('/:path*');
  });

  describe('without a session cookie', () => {
    it('sends a page request to sign-in with 303, never 307, remembering where it was going', async () => {
      const { proxy } = await loadProxy('http://localhost:3000');
      const response = proxy(new NextRequest('http://internal:8080/settings?tab=mail'));
      // 303 turns the follow-up into a GET; 307 would repeat a POST at the sign-in page.
      expect(response.status).toBe(303);
      const target = new URL(response.headers.get('location') ?? '');
      expect(target.origin).toBe('http://localhost:3000');
      expect(target.pathname).toBe('/sign-in');
      expect(target.searchParams.get('returnTo')).toBe('/settings?tab=mail');
    });

    it('does not add a return address for the home page', async () => {
      const { proxy } = await loadProxy('http://localhost:3000');
      const response = proxy(new NextRequest('http://localhost:3000/'));
      expect(response.headers.get('location')).toBe('http://localhost:3000/sign-in');
    });

    it('puts the Content Security Policy on the redirect too', async () => {
      const { proxy } = await loadProxy('http://localhost:3000');
      const csp = proxy(new NextRequest('http://localhost:3000/')).headers.get(
        'content-security-policy',
      );
      expect(csp).toContain("default-src 'self'");
    });

    it.each([
      '/sign-in',
      '/sign-up',
      '/sign-in/two-factor',
      '/privacy',
      '/tos',
      '/forgot-password',
      '/reset-password',
      '/invite/0b9e5a3c-7d1f-4a52-8c64-2f1e9d3b7a10',
      '/api/health',
      '/api/auth/sign-in/email',
      '/api/auth/get-session',
      '/api/avatars/some-user-id',
      '/api/branding/favicon',
      '/.well-known/openid-configuration',
      '/.well-known/oauth-authorization-server',
      '/.well-known/sovereign-instance',
      '/api/auth/oauth2/authorize',
      '/api/auth/oauth2/token',
      '/api/auth/jwks',
      '/_next/static/chunks/app.js',
      '/favicon.ico',
      '/manifest.webmanifest',
      '/sw.js',
      '/icons/favicon.svg',
      '/icons/apple-touch-icon.png',
    ])('lets %s through', async (path) => {
      const { proxy } = await loadProxy('http://localhost:3000');
      const response = proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it.each([
      '/api/authors',
      '/sign-in/extra',
      '/sign-in/two-factor/extra',
      '/security/two-factor',
      '/security/passkeys',
      '/api/avatar',
      '/api/profile/avatar',
      '/.well-known/',
      '/.well-known/openid-configuration/extra',
      '/.well-known/sovereign-instance/extra',
      '/.well-known/sovereign-instances',
      '/.well-known/jwks.json',
      '/consent',
      '/sign-ups',
      '/api/healthz',
      '/console',
      '/reset-password/extra',
      '/invite',
      '/invites/abc',
      '/console/invites',
      '/console/settings',
      '/forgot-passwords',
      '/privacy/extra',
      '/terms',
      '/icons',
      '/manifest.json',
      '/sw.js/extra',
      '/sw.json',
      '/manifest.webmanifest/extra',
      '/iconsx/favicon.svg',
    ])('does not mistake %s for a public path', async (path) => {
      const { proxy } = await loadProxy('http://localhost:3000');
      expect(proxy(new NextRequest(`http://localhost:3000${path}`)).status).toBe(303);
    });
  });

  describe('with a session cookie', () => {
    const through = async (
      url: string,
      cookieDomain: string | undefined,
      name: string,
    ): Promise<number> => {
      const { proxy } = await loadProxy(url, cookieDomain);
      return proxy(new NextRequest(`${url}/`, { headers: { cookie: `${name}=x` } })).status;
    };

    // The name is the one this instance sets (src/auth/cookies.ts), and only that one: better-auth would not read a
    // cookie under another name as a session either, and a subdomain's planted one is turned away at the door.
    it.each([
      ['over http', 'http://localhost:3000', undefined, 'better-auth.session_token'],
      [
        'over https on its own host',
        'https://core.example.com',
        undefined,
        '__Host-better-auth.session_token',
      ],
      [
        'over https with a cookie domain',
        'https://core.example.com',
        'example.com',
        '__Secure-better-auth.session_token',
      ],
    ])(
      'lets a request through with the session cookie %s (the page verifies it)',
      async (_, url, domain, name) => {
        expect(await through(url, domain, name)).toBe(200);
      },
    );

    it('reads SV_URL as the configuration does, so a differently written one still finds the cookie', async () => {
      for (const url of ['HTTPS://Core.Example.com', 'HTTPS://core.example.com:8443']) {
        expect(await through(url, undefined, '__Host-better-auth.session_token'), url).toBe(200);
        expect(await through(url, undefined, 'better-auth.session_token'), url).toBe(303);
      }
    });

    it('treats a blank cookie domain as unset, as the configuration does', async () => {
      expect(
        await through('https://core.example.com', '', '__Host-better-auth.session_token'),
      ).toBe(200);
      expect(
        await through('https://core.example.com', '  ', '__Secure-better-auth.session_token'),
      ).toBe(303);
    });

    it.each([
      [
        'over http',
        'http://localhost:3000',
        undefined,
        ['__Host-better-auth.session_token', '__Secure-better-auth.session_token'],
      ],
      [
        'over https on its own host',
        'https://core.example.com',
        undefined,
        ['better-auth.session_token', '__Secure-better-auth.session_token'],
      ],
      [
        'over https with a cookie domain',
        'https://core.example.com',
        'example.com',
        ['better-auth.session_token', '__Host-better-auth.session_token'],
      ],
    ])('turns away a session cookie under another name %s', async (_, url, domain, names) => {
      for (const name of names) expect(await through(url, domain, name), name).toBe(303);
    });

    it('does not take another cookie, or the session_data cache, for a session', async () => {
      const { proxy } = await loadProxy('http://localhost:3000');
      for (const cookie of ['better-auth.session_data=x', 'session_token=x', 'theme=dark']) {
        const response = proxy(new NextRequest('http://localhost:3000/', { headers: { cookie } }));
        expect(response.status, cookie).toBe(303);
      }
    });
  });
});
