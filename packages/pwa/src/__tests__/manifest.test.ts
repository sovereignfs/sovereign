import { describe, expect, it } from 'vitest';
import { PWA_CSP_DIRECTIVES, pwaMetadata, pwaViewport } from '../metadata';
import { iconSet, manifest, shortName } from '../manifest';

describe('the manifest', () => {
  it('has what installing needs, and what opening the installed app from core needs', () => {
    expect(manifest({ name: 'Notes' })).toEqual({
      id: '/',
      name: 'Notes',
      short_name: 'Notes',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: iconSet(),
      launch_handler: { client_mode: ['navigate-existing', 'auto'] },
      handle_links: 'preferred',
      lang: 'en',
      dir: 'ltr',
    });
  });

  it('takes its id from the start address, so an app that had none keeps the identity it was installed under', () => {
    expect(manifest({ name: 'Notes', startUrl: '/desk' }).id).toBe('/desk');
    expect(manifest({ name: 'Notes', startUrl: '/desk', id: '/' }).id).toBe('/');
  });

  it('names icons of each size a browser asks for, one of them drawn to be masked', () => {
    expect(iconSet().map((icon) => [icon.sizes, icon.purpose])).toEqual([
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ]);
  });

  it('refuses an address that is not on the app', () => {
    expect(() => manifest({ name: 'Notes', startUrl: 'https://elsewhere.example/' })).toThrow(
      TypeError,
    );
    expect(() => manifest({ name: 'Notes', scope: '//elsewhere.example/' })).toThrow(TypeError);
  });

  it.each([
    ['Notes', 'Notes'],
    ['Acme Family Cloud', 'Acme Family'],
    ['Supercalifragilistic', 'Supercalifra'],
  ])('shortens %j to %j for under an icon', (name, short) => {
    expect(shortName(name)).toBe(short);
  });
});

describe('what the layout tells a device', () => {
  it('lets an iPhone open the app from its Home Screen without Safari, with its own icon', () => {
    expect(pwaMetadata({ name: 'Notes' })).toEqual({
      appleWebApp: { capable: true, title: 'Notes', statusBarStyle: 'default' },
      icons: { apple: '/pwa-icon/apple' },
    });
  });

  it('runs the page to the edges, and colours the bar for each scheme', () => {
    expect(pwaViewport({ light: '#fff', dark: '#000' })).toEqual({
      viewportFit: 'cover',
      themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#fff' },
        { media: '(prefers-color-scheme: dark)', color: '#000' },
      ],
    });
  });

  it('names the worker and the manifest for a content security policy', () => {
    expect(PWA_CSP_DIRECTIVES).toEqual(["worker-src 'self'", "manifest-src 'self'"]);
  });
});
