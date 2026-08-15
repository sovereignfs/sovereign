import type { SovereignManifest } from '@sovereignfs/manifest';
import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  SOVEREIGN_TRUST_HEADERS,
  applyCsp,
  buildLoginRedirect,
  buildPaywallRedirect,
  strippedRequestHeaders,
  withCookies,
  withDevMode,
} from '../response';

function request(
  path: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  return new NextRequest(`http://runtime.test${path}`, init);
}

describe('strippedRequestHeaders', () => {
  it('strips every platform-trust header from the inbound clone', () => {
    const headers = new Headers();
    for (const name of SOVEREIGN_TRUST_HEADERS) headers.set(name, 'forged');
    headers.set('x-other', 'kept');
    const stripped = strippedRequestHeaders(request('/', { headers }));
    for (const name of SOVEREIGN_TRUST_HEADERS) expect(stripped.has(name)).toBe(false);
    expect(stripped.get('x-other')).toBe('kept');
  });
});

describe('applyCsp / withCookies / withDevMode', () => {
  it('stamps the CSP header on the response', () => {
    const response = applyCsp(NextResponse.next(), "default-src 'self'");
    expect(response.headers.get('content-security-policy')).toBe("default-src 'self'");
  });

  it('appends every forwarded Set-Cookie', () => {
    const response = withCookies(NextResponse.next(), ['a=1', 'b=2']);
    expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
  });

  it('sets the dev-mode header only when active', () => {
    expect(withDevMode(NextResponse.next(), true).headers.get('x-sovereign-dev-mode')).toBe(
      'active',
    );
    expect(withDevMode(NextResponse.next(), false).headers.get('x-sovereign-dev-mode')).toBeNull();
  });
});

describe('buildLoginRedirect', () => {
  it('rewrites (not redirects) GET / with no returnUrl', () => {
    const response = buildLoginRedirect(request('/'), []);
    expect(response.headers.get('x-middleware-rewrite')).toBe('http://runtime.test/login');
  });

  it('rewrites an installable plugin bare routePrefix with a returnUrl', () => {
    const tally = {
      id: 'fs.example.tally',
      routePrefix: '/tally',
      installable: true,
    } as SovereignManifest;
    const response = buildLoginRedirect(request('/tally'), [tally]);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://runtime.test/login?returnUrl=%2Ftally',
    );
  });

  it('does not rewrite a nested path under an installable plugin', () => {
    const tally = {
      id: 'fs.example.tally',
      routePrefix: '/tally',
      installable: true,
    } as SovereignManifest;
    const response = buildLoginRedirect(request('/tally/groups/42'), [tally]);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.status).toBe(303);
  });

  it('redirects a non-root GET with a 303 and returnUrl', () => {
    const response = buildLoginRedirect(request('/console?tab=users'), []);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://runtime.test/login?returnUrl=%2Fconsole%3Ftab%3Dusers',
    );
  });

  it('redirects an unauthenticated POST with 303, never a method-preserving 307', () => {
    const response = buildLoginRedirect(request('/console', { method: 'POST' }), []);
    expect(response.status).toBe(303);
  });
});

describe('buildPaywallRedirect', () => {
  it('redirects to /paywall/<pluginId> with a 303', () => {
    const response = buildPaywallRedirect(request('/paid'), 'fs.example.paid');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://runtime.test/paywall/fs.example.paid');
  });

  it('URL-encodes the plugin id', () => {
    const response = buildPaywallRedirect(request('/x'), 'fs.example/weird id');
    expect(response.headers.get('location')).toBe(
      'http://runtime.test/paywall/fs.example%2Fweird%20id',
    );
  });
});
