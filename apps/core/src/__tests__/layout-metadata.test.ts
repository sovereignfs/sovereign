import { describe, expect, it, vi } from 'vitest';
import { THEME_COLORS } from '../pwa';

const identity = vi.fn();
vi.mock('../instance/service', () => ({ getInstanceIdentity: () => identity() as unknown }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.stubEnv('SV_URL', 'https://core.example.com');
vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');

const { generateMetadata, viewport } = await import('../../app/layout');

describe('what the root layout tells a device', () => {
  it('lets the page run to the screen’s edges, and the browser’s bar take the page’s colour in each scheme', () => {
    expect(viewport.viewportFit).toBe('cover');
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
      { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
    ]);
  });

  it('lets an iPhone open a page added to its home screen as an app, named for the instance', async () => {
    identity.mockResolvedValue({ name: 'Acme', favicon: undefined });
    expect((await generateMetadata()).appleWebApp).toEqual({
      capable: true,
      title: 'Acme',
      statusBarStyle: 'black-translucent',
    });
  });

  it('is the same whether or not the instance has its own favicon', async () => {
    identity.mockResolvedValue({ name: 'Acme', favicon: '/api/branding/favicon?v=1' });
    const metadata = await generateMetadata();
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: 'Acme' });
    expect(metadata.icons).toEqual({ icon: '/api/branding/favicon?v=1' });
  });
});
