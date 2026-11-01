import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ICONS } from '../branding/default-icons';

const identity = vi.fn();
vi.mock('../instance/service', () => ({ getInstanceIdentity: () => identity() as unknown }));
vi.stubEnv('SV_URL', 'https://core.sovereign.local');
vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');

const { GET: icon } = await import('../../app/icons/[name]/route');
const { GET: favicon } = await import('../../app/favicon.ico/route');
const named = (name: string) =>
  icon(new Request('https://core.sovereign.local/icons/x'), { params: Promise.resolve({ name }) });

describe('the icons an instance has until it sets a favicon', () => {
  it.each([
    ['favicon.svg', 'image/svg+xml', '<svg'],
    ['favicon.ico', 'image/x-icon', ''],
    ['apple-touch-icon.png', 'image/png', '\x89PNG'],
    ['icon-192.png', 'image/png', '\x89PNG'],
    ['icon-512.png', 'image/png', '\x89PNG'],
    ['icon-maskable-512.png', 'image/png', '\x89PNG'],
  ])('serves %s as what it is', async (name, type, start) => {
    const response = await named(name);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(type);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(100);
    expect(bytes.subarray(0, start.length || 1).toString('latin1')).toContain(start);
    expect(bytes.equals(DEFAULT_ICONS[name]?.bytes ?? Buffer.alloc(0))).toBe(true);
  });

  it('is the Sovereign mark: an S in white on a dark rounded square', () => {
    const svg = DEFAULT_ICONS['favicon.svg']?.bytes.toString() ?? '';
    expect(svg).toContain('rx="14" fill="#0a0a0a"');
    expect(svg).toContain('fill="#ffffff"');
  });

  it.each(['nope.svg', '../secret', 'constructor', '__proto__', ''])('has no %j', async (name) => {
    expect((await named(name)).status).toBe(404);
  });
});

describe('/favicon.ico', () => {
  it('sends a browser to the default favicon until the operator sets one', async () => {
    identity.mockResolvedValue({ favicon: undefined });
    const response = await favicon();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://core.sovereign.local/icons/favicon.ico');
  });

  it('sends it to the instance’s own, as soon as there is one', async () => {
    identity.mockResolvedValue({ favicon: '/api/branding/favicon?v=3' });
    const response = await favicon();
    expect(response.headers.get('location')).toBe(
      'https://core.sovereign.local/api/branding/favicon?v=3',
    );
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });
});
