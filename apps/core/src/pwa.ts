/**
 * What an installed core looks like (RFC 0001): the colours of its window and the icons its manifest names. The
 * colours are the design system's page colours, as the pages themselves draw them, so a window opens in the colour
 * of the page that fills it; a test holds them to the tokens.
 */

/** `--sv-white` and `--sv-grey-950`: the page colour of the light and of the dark theme. */
export const THEME_COLORS = { light: '#ffffff', dark: '#09090b' } as const;

/** A manifest's icons: the Sovereign mark, in the sizes a browser asks for, one of them made for masking. */
export const MANIFEST_ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const;

/**
 * How an installed core is opened again (RFC 0001 A1): a window already open is brought forward rather than a second
 * one started; `auto` is the fallback for a browser that knows no other value.
 */
export const LAUNCH_HANDLER = { client_mode: ['focus-existing', 'auto'] } as const;

/**
 * The shortcuts an installed core's icon offers (RFC 0001 A1): only pages every signed-in person has, so the manifest
 * still says nothing about who asks. The Console is not one: who may enter it depends on a role.
 */
export const MANIFEST_SHORTCUTS = [
  { name: 'Your apps', short_name: 'Apps', url: '/' },
  { name: 'Your account', short_name: 'Account', url: '/profile' },
].map((shortcut) => ({
  ...shortcut,
  icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
}));

/**
 * The pictures a browser's install sheet shows (RFC 0001 A1): the sign-in page with the default branding, one for a
 * phone and one for a wide screen. They are served with the icons, from code (`src/branding/screenshots.ts`).
 */
export const MANIFEST_SCREENSHOTS = [
  {
    src: '/icons/screenshot-narrow.png',
    sizes: '540x1170',
    type: 'image/png',
    form_factor: 'narrow',
    label: 'Signing in',
  },
  {
    src: '/icons/screenshot-wide.png',
    sizes: '1280x800',
    type: 'image/png',
    form_factor: 'wide',
    label: 'Signing in',
  },
] as const;

/** A name short enough for under an icon: the first twelve characters, cut at a space when there is one. */
export function shortName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 12) return trimmed;
  const cut = trimmed.slice(0, 12);
  const space = cut.lastIndexOf(' ');
  return (space >= 4 ? cut.slice(0, space) : cut).trim();
}

export type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: 'any' | 'maskable';
};

/**
 * The icons a manifest names. An instance that has set its own app icon gets it, for both the sizes a device asks
 * for (the picture is at least 512 pixels, and the device scales it down), and a maskable one only if the operator
 * supplied one drawn for masking: the Sovereign maskable icon would put another mark on an Android home screen. An
 * instance that has set none has the Sovereign mark.
 */
export function manifestIcons(own: {
  appIcon?: string | undefined;
  appIconMaskable?: string | undefined;
}): ManifestIcon[] {
  if (!own.appIcon) return MANIFEST_ICONS.map((icon) => ({ ...icon }));
  const png = (src: string, sizes: string, purpose: ManifestIcon['purpose']): ManifestIcon => ({
    src,
    sizes,
    type: 'image/png',
    purpose,
  });
  return [
    png(own.appIcon, '192x192', 'any'),
    png(own.appIcon, '512x512', 'any'),
    ...(own.appIconMaskable ? [png(own.appIconMaskable, '512x512', 'maskable')] : []),
  ];
}
