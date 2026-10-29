import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce } from '../csp';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((part) => {
      const [name = '', ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

describe('createNonce', () => {
  it('is 16 random bytes, base64 encoded', () => {
    expect(atob(createNonce())).toHaveLength(16);
  });

  it('is different every time', () => {
    const nonces = new Set(Array.from({ length: 1000 }, () => createNonce()));
    expect(nonces.size).toBe(1000);
  });
});

describe('buildCsp', () => {
  const nonce = 'abc123==';

  it('lets a script run only with the nonce or from a script that has it', () => {
    const scriptSrc = directives(buildCsp({ nonce })).get('script-src');
    expect(scriptSrc).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
  });

  it.each([
    { development: false, upgradeInsecureRequests: false },
    { development: true, upgradeInsecureRequests: false },
    { development: false, upgradeInsecureRequests: true },
    { development: true, upgradeInsecureRequests: true },
  ])("never puts 'unsafe-inline' in script-src (%o)", (options) => {
    const scriptSrc = directives(buildCsp({ nonce, ...options })).get('script-src') ?? [];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc.join(' ')).not.toContain('unsafe-inline');
  });

  it("allows 'unsafe-eval' in development only", () => {
    expect(directives(buildCsp({ nonce, development: true })).get('script-src')).toContain(
      "'unsafe-eval'",
    );
    expect(directives(buildCsp({ nonce })).get('script-src')).not.toContain("'unsafe-eval'");
  });

  it('requires the nonce for style elements and allows only style attributes inline', () => {
    const csp = directives(buildCsp({ nonce }));
    expect(csp.get('style-src')).toEqual(["'self'", `'nonce-${nonce}'`]);
    expect(csp.get('style-src-attr')).toEqual(["'unsafe-inline'"]);
  });

  it('lets development draw its overlay with inline styles, and nothing else relaxes there or elsewhere', () => {
    const dev = directives(buildCsp({ nonce, development: true }));
    expect(dev.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    // Scripts keep the nonce in development too.
    expect(dev.get('script-src')?.join(' ')).not.toContain("'unsafe-inline'");
    expect(directives(buildCsp({ nonce })).get('style-src')?.join(' ')).not.toContain(
      "'unsafe-inline'",
    );
  });

  it('denies plugins and framing, and pins base and form targets to core itself', () => {
    const csp = directives(buildCsp({ nonce }));
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
  });

  it('asks for the https upgrade only when told core is served over https', () => {
    expect(buildCsp({ nonce })).not.toContain('upgrade-insecure-requests');
    expect(buildCsp({ nonce, upgradeInsecureRequests: true })).toContain(
      'upgrade-insecure-requests',
    );
  });
});

describe('pictures from other addresses', () => {
  const nonce = 'abc123==';
  const imgSrc = (options: Parameters<typeof buildCsp>[0]) =>
    directives(buildCsp(options)).get('img-src');

  it('are not loaded by default: only core’s own, blobs and data', () => {
    expect(imgSrc({ nonce })).toEqual(["'self'", 'blob:', 'data:']);
  });

  it('are allowed over https alone when a page asks for them, and nothing else is loosened', () => {
    expect(imgSrc({ nonce, remoteImages: true })).toEqual(["'self'", 'blob:', 'data:', 'https:']);
    const csp = buildCsp({ nonce, remoteImages: true });
    const all = directives(csp);
    expect(all.get('default-src')).toEqual(["'self'"]);
    expect(all.get('script-src')).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(all.get('connect-src')).toEqual(["'self'"]);
    expect(all.get('form-action')).toEqual(["'self'"]);
    expect(csp).not.toMatch(/img-src[^;]*\*(?!:)/);
  });

  it('allow http on localhost only on a development instance', () => {
    expect(imgSrc({ nonce, remoteImages: true, development: true })).toEqual([
      "'self'",
      'blob:',
      'data:',
      'https:',
      'http://localhost:*',
      'http://*.localhost:*',
    ]);
    expect(imgSrc({ nonce, remoteImages: false, development: true })).toEqual([
      "'self'",
      'blob:',
      'data:',
    ]);
  });
});
