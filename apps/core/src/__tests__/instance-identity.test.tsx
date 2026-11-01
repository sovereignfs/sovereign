import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandingStore, BrandingSummary } from '../branding/store';
import { loadIdentity, PLAIN_IDENTITY } from '../instance/identity';
import type { SettingsStore } from '../settings/store';

const picture = (kind: string, contentType = 'image/png'): BrandingSummary => ({
  contentType,
  version: 'v1',
  size: 10,
  path: `/api/branding/${kind}?v=v1`,
});
const stores = (
  name: string | undefined,
  images: Partial<Record<'logo-light' | 'logo-dark' | 'favicon', BrandingSummary>>,
) => ({
  settings: { value: () => Promise.resolve(name) } as unknown as SettingsStore,
  branding: {
    describe: () =>
      Promise.resolve({
        'logo-light': undefined,
        'logo-dark': undefined,
        favicon: undefined,
        ...images,
      }),
  } as unknown as BrandingStore,
});
const identity = (name: string | undefined, images = {}) => {
  const { settings, branding } = stores(name, images);
  return loadIdentity(settings, branding, 'https://id.sovereign.local');
};

describe('how the instance presents itself', () => {
  it('is plain when nothing is set', async () => {
    expect(await identity(undefined)).toEqual(PLAIN_IDENTITY);
    expect(PLAIN_IDENTITY.name).toBe('Sovereign');
  });

  it('carries the name and the favicon’s address', async () => {
    const got = await identity('Acme', { favicon: picture('favicon') });
    expect(got).toMatchObject({ name: 'Acme', favicon: '/api/branding/favicon?v=v1' });
  });

  it('uses one logo for both pages when only one was given', async () => {
    expect(await identity('A', { 'logo-light': picture('logo-light') })).toMatchObject({
      logoLight: '/api/branding/logo-light?v=v1',
      logoDark: '/api/branding/logo-light?v=v1',
    });
    expect(await identity('A', { 'logo-dark': picture('logo-dark') })).toMatchObject({
      logoLight: '/api/branding/logo-dark?v=v1',
      logoDark: '/api/branding/logo-dark?v=v1',
    });
  });

  it('gives each page its own logo when both were given', async () => {
    expect(
      await identity('A', {
        'logo-light': picture('logo-light'),
        'logo-dark': picture('logo-dark'),
      }),
    ).toMatchObject({
      logoLight: '/api/branding/logo-light?v=v1',
      logoDark: '/api/branding/logo-dark?v=v1',
    });
  });

  it('gives an email the light logo as an absolute address on core', async () => {
    expect((await identity('A', { 'logo-light': picture('logo-light') })).emailLogo).toBe(
      'https://id.sovereign.local/api/branding/logo-light?v=v1',
    );
  });

  it('never gives an email an SVG, or a logo meant for a dark page', async () => {
    expect(
      (await identity('A', { 'logo-light': picture('logo-light', 'image/svg+xml') })).emailLogo,
    ).toBeUndefined();
    expect((await identity('A', { 'logo-dark': picture('logo-dark') })).emailLogo).toBeUndefined();
  });
});

const identityNow = vi.fn();
vi.mock('../instance/service', () => ({
  getInstanceIdentity: () => identityNow() as unknown,
}));
const { BrandMark } = await import('../../app/brand-mark');

describe('the instance’s mark', () => {
  beforeEach(() => identityNow.mockReset());

  it('is the first letter of the instance’s name in a badge when no logo is set', async () => {
    identityNow.mockResolvedValue({ ...PLAIN_IDENTITY, name: 'acme' });
    const html = renderToStaticMarkup(await BrandMark({}));
    expect(html).toContain('>A</span>');
    expect(html).not.toContain('<img');
    expect(html).toContain('aria-hidden="true"');
  });

  it('is the instance’s own logo when it has one: both pictures, for the theme to choose from', async () => {
    identityNow.mockResolvedValue({
      ...PLAIN_IDENTITY,
      name: 'Acme',
      logoLight: '/api/branding/logo-light?v=1',
      logoDark: '/api/branding/logo-dark?v=1',
    });
    const html = renderToStaticMarkup(await BrandMark({}));
    expect(html).toContain('src="/api/branding/logo-light?v=1"');
    expect(html).toContain('src="/api/branding/logo-dark?v=1"');
  });

  it('names the logo only where nothing beside it says whose it is', async () => {
    identityNow.mockResolvedValue({
      ...PLAIN_IDENTITY,
      name: 'Acme',
      logoLight: '/api/branding/logo-light?v=1',
      logoDark: '/api/branding/logo-dark?v=1',
    });
    expect(renderToStaticMarkup(await BrandMark({})).match(/alt=""/g)).toHaveLength(2);
    expect(
      renderToStaticMarkup(await BrandMark({ labelled: true })).match(/alt="Acme"/g),
    ).toHaveLength(2);
  });

  it('is larger in the header than above a page’s title', async () => {
    identityNow.mockResolvedValue(PLAIN_IDENTITY);
    const small = renderToStaticMarkup(await BrandMark({}));
    const large = renderToStaticMarkup(await BrandMark({ size: 'lg' }));
    expect(small).toMatch(/class="[^"]*\bmd\b/);
    expect(large).toMatch(/class="[^"]*\blg\b/);
  });
});
