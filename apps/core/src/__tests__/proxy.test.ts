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

function nonceOf(csp: string): string {
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  if (!nonce) throw new Error(`no nonce in: ${csp}`);
  return nonce;
}

describe('proxy', () => {
  it('puts the Content Security Policy on the response', async () => {
    const { proxy } = await loadProxy('http://localhost:3000');
    const csp = proxy(new NextRequest('http://localhost:3000/')).headers.get(
      'content-security-policy',
    );
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('uses a fresh nonce for every request', async () => {
    const { proxy } = await loadProxy('http://localhost:3000');
    const nonces = new Set(
      Array.from({ length: 50 }, () =>
        nonceOf(
          proxy(new NextRequest('http://localhost:3000/')).headers.get('content-security-policy') ??
            '',
        ),
      ),
    );
    expect(nonces.size).toBe(50);
  });

  it('hands the same nonce and policy to the page through the request', async () => {
    const { proxy } = await loadProxy('http://localhost:3000');
    const response = proxy(new NextRequest('http://localhost:3000/'));
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(csp));
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('does not let a caller choose the nonce', async () => {
    const { proxy } = await loadProxy('http://localhost:3000');
    const request = new NextRequest('http://localhost:3000/', {
      headers: { 'x-nonce': 'attacker', 'content-security-policy': "script-src 'unsafe-inline'" },
    });
    const response = proxy(request);
    expect(response.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
    expect(response.headers.get('content-security-policy')).not.toContain('attacker');
  });

  it('asks for the https upgrade only when core is served over https', async () => {
    const insecure = await loadProxy('http://localhost:3000');
    expect(
      insecure
        .proxy(new NextRequest('http://localhost:3000/'))
        .headers.get('content-security-policy'),
    ).not.toContain('upgrade-insecure-requests');
    const secure = await loadProxy('https://core.example.com');
    expect(
      secure
        .proxy(new NextRequest('https://core.example.com/'))
        .headers.get('content-security-policy'),
    ).toContain('upgrade-insecure-requests');
  });

  it('matches every path, so API routes and static files carry the policy too', async () => {
    const { config } = await loadProxy('http://localhost:3000');
    expect(config.matcher).toBe('/:path*');
  });
});
