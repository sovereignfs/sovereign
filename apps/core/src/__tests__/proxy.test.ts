import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadProxy(url: string) {
  vi.resetModules();
  vi.stubEnv('SV_URL', url);
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
      '/api/health',
      '/api/auth/sign-in/email',
      '/api/auth/get-session',
      '/_next/static/chunks/app.js',
      '/favicon.ico',
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
      '/sign-ups',
      '/api/healthz',
      '/console',
      '/reset-password/extra',
      '/forgot-passwords',
      '/privacy/extra',
      '/terms',
    ])('does not mistake %s for a public path', async (path) => {
      const { proxy } = await loadProxy('http://localhost:3000');
      expect(proxy(new NextRequest(`http://localhost:3000${path}`)).status).toBe(303);
    });
  });

  describe('with a session cookie', () => {
    it.each(['better-auth.session_token', '__Secure-better-auth.session_token'])(
      'lets a request with %s through (the page verifies it)',
      async (name) => {
        const { proxy } = await loadProxy('http://localhost:3000');
        const response = proxy(
          new NextRequest('http://localhost:3000/', { headers: { cookie: `${name}=x` } }),
        );
        expect(response.status).toBe(200);
      },
    );

    it('does not take another cookie, or the session_data cache, for a session', async () => {
      const { proxy } = await loadProxy('http://localhost:3000');
      for (const cookie of ['better-auth.session_data=x', 'session_token=x', 'theme=dark']) {
        const response = proxy(new NextRequest('http://localhost:3000/', { headers: { cookie } }));
        expect(response.status, cookie).toBe(303);
      }
    });
  });
});
