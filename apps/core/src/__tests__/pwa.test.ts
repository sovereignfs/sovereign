import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ICONS } from '../branding/default-icons';
import { MANIFEST_ICONS, shortName, THEME_COLORS } from '../pwa';

const identity = vi.fn();
vi.mock('../instance/service', () => ({ getInstanceIdentity: () => identity() as unknown }));

const { default: manifest } = await import('../../app/manifest');

const tokens = readFileSync(
  new URL('../../../../packages/ui/src/tokens/primitives.css', import.meta.url),
  'utf8',
);
const token = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens)?.[1];

/** A PNG's width and height, from its header. */
const dimensions = (bytes: Buffer) => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

describe('the colours of an installed core', () => {
  it('are the design system’s page colours, so the window opens in the colour of the page', () => {
    expect(THEME_COLORS.light).toBe(token('--sv-white'));
    expect(THEME_COLORS.dark).toBe(token('--sv-grey-950'));
  });
});

describe('a short name', () => {
  it.each([
    ['Sovereign', 'Sovereign'],
    ['  Acme  ', 'Acme'],
    ['Sovereign Core', 'Sovereign'],
    ['Acme Family Cloud', 'Acme Family'],
    ['Supercalifragilistic', 'Supercalifra'],
    ['', ''],
  ])('for %j is %j', (name, short) => {
    expect(shortName(name)).toBe(short);
  });
});

describe('the icons a manifest names', () => {
  it.each(MANIFEST_ICONS.map((icon) => [icon.src, icon] as const))(
    '%s is served, as a PNG of the size it says',
    (_src, icon) => {
      const served = DEFAULT_ICONS[icon.src.replace('/icons/', '')];
      expect(served?.contentType).toBe(icon.type);
      expect(dimensions(served?.bytes ?? Buffer.alloc(24))).toBe(icon.sizes);
    },
  );

  it('include a maskable one, since a browser masks it to the shape of the device’s icons', () => {
    expect(MANIFEST_ICONS.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(MANIFEST_ICONS.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(MANIFEST_ICONS.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(
      true,
    );
  });
});

describe('the web app manifest', () => {
  it('names the instance, and opens at its own launcher, in a window of its own', async () => {
    identity.mockResolvedValue({ name: 'Acme Family Cloud' });
    const made = await manifest();
    expect(made).toMatchObject({
      id: '/',
      name: 'Acme Family Cloud',
      short_name: 'Acme Family',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      background_color: THEME_COLORS.light,
      theme_color: THEME_COLORS.light,
    });
    expect(made.icons).toEqual(MANIFEST_ICONS.map((icon) => ({ ...icon })));
  });

  it('follows the name when the operator renames the instance', async () => {
    identity.mockResolvedValue({ name: 'Sovereign' });
    expect((await manifest()).name).toBe('Sovereign');
    identity.mockResolvedValue({ name: 'Home' });
    expect((await manifest()).name).toBe('Home');
  });

  it('takes nothing from the request, so it cannot say who is asking', () => {
    expect(manifest.length).toBe(0);
  });

  it('stays inside core’s own origin: a relative scope and start address', async () => {
    identity.mockResolvedValue({ name: 'Sovereign' });
    const made = await manifest();
    for (const address of [made.start_url, made.scope, made.id]) expect(address).toBe('/');
    for (const icon of made.icons ?? []) expect(icon.src).toMatch(/^\/icons\//);
  });
});
