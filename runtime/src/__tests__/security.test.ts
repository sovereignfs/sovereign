import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT_CSP_HASH, buildContentSecurityPolicy, generateNonce } from '../security';
import { themeScript } from '../theme-script';

describe('generateNonce', () => {
  it('produces a non-empty base64 string', () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(nonce.length).toBeGreaterThan(0);
  });

  it('produces a different value each call', () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe('buildContentSecurityPolicy', () => {
  it('nonces script-src and never allows unsafe-inline scripts', () => {
    const csp = buildContentSecurityPolicy('abc123', { isProd: true });
    expect(csp).toContain(`script-src 'self' 'nonce-abc123'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('locks down object/base/frame and denies framing', () => {
    const csp = buildContentSecurityPolicy('n', { isProd: false });
    expect(csp).toContain(`object-src 'none'`);
    expect(csp).toContain(`base-uri 'self'`);
    expect(csp).toContain(`frame-ancestors 'none'`);
    expect(csp).toContain(`default-src 'self'`);
  });

  it('adds upgrade-insecure-requests only in production', () => {
    expect(buildContentSecurityPolicy('n', { isProd: true })).toContain(
      'upgrade-insecure-requests',
    );
    expect(buildContentSecurityPolicy('n', { isProd: false })).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('allows the inline theme script by hash', () => {
    expect(buildContentSecurityPolicy('n', { isProd: true })).toContain(THEME_SCRIPT_CSP_HASH);
  });

  it("allows 'unsafe-eval' in dev (webpack eval) but never in production", () => {
    expect(buildContentSecurityPolicy('n', { isProd: false })).toContain(`'unsafe-eval'`);
    expect(buildContentSecurityPolicy('n', { isProd: true })).not.toContain(`'unsafe-eval'`);
  });
});

describe('THEME_SCRIPT_CSP_HASH', () => {
  it('matches the current theme script (guards against drift)', () => {
    const hash = `'sha256-${createHash('sha256').update(themeScript).digest('base64')}'`;
    expect(THEME_SCRIPT_CSP_HASH).toBe(hash);
  });
});
