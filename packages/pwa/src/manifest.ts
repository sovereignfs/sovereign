/**
 * The web app manifest of a Sovereign app (RFC 0001 A7): what a browser reads to install it. It is the same for everyone who asks, so it
 * never says who is signed in. Return it from `app/manifest.ts`.
 */

export type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: 'any' | 'maskable' | 'monochrome';
};

export type ManifestShortcut = {
  name: string;
  short_name?: string;
  url: string;
  icons?: { src: string; sizes: string; type: string }[];
};

/** How an installed app is opened again (Launch Handler API). */
export type ClientMode = 'auto' | 'focus-existing' | 'navigate-existing' | 'navigate-new';

export type WebAppManifest = {
  id: string;
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  display_override: ('standalone' | 'minimal-ui')[];
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
  launch_handler: { client_mode: ClientMode[] };
  handle_links: 'auto' | 'preferred' | 'not-preferred';
  lang: string;
  dir: 'ltr' | 'rtl' | 'auto';
  categories?: string[];
  shortcuts?: ManifestShortcut[];
};

export type ManifestOptions = {
  /** The app's name, as people know it. */
  name: string;
  /** Under the icon. Defaults to the first twelve characters of the name, cut at a space. */
  shortName?: string;
  description?: string;
  /** Where the installed app opens. Default `/`. */
  startUrl?: string;
  /**
   * How a browser knows the installed app. Defaults to the start address, which is what a browser derives when a manifest names no id,
   * so an app that had none keeps the identity it was installed under. Never change it once people have installed the app.
   */
  id?: string;
  /** Default `/`: the whole origin. */
  scope?: string;
  /** The page colour of the light theme, for the window and the splash. Default white. */
  backgroundColor?: string;
  /** The window's bar. Default: the background colour. */
  themeColor?: string;
  /** Default: `iconSet()`. */
  icons?: ManifestIcon[];
  shortcuts?: ManifestShortcut[];
  categories?: string[];
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  /**
   * How a link into the app opens it when it is installed. Default `['navigate-existing', 'auto']`: a window already open goes to the
   * address, so a tile in core that opens a page of the app lands on that page (research 0010).
   */
  clientMode?: ClientMode[];
  /** Whether links into the app's scope should open the installed app. Default `preferred` (research 0010). */
  handleLinks?: WebAppManifest['handle_links'];
};

/** Where the icons `iconSet()` names are served, by default. */
export const ICON_BASE = '/pwa-icon';

/**
 * The icons a browser asks for: 192 and 512 pixels of any shape, and a 512 pixel one drawn to be masked (its mark inside the middle 80%).
 * Each is `<base>/<variant>`, a PNG; the app serves them (the template draws them with `next/og`).
 */
export function iconSet(base: string = ICON_BASE): ManifestIcon[] {
  return [
    { src: `${base}/192`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${base}/512`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${base}/maskable`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
}

/** A name short enough for under an icon: the first twelve characters, cut at a space when there is one. */
export function shortName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 12) return trimmed;
  const cut = trimmed.slice(0, 12);
  const space = cut.lastIndexOf(' ');
  return (space >= 4 ? cut.slice(0, space) : cut).trim();
}

/** An address of this app: a path, never one that starts with two slashes (another site's). */
function ownPath(value: string, what: string): string {
  if (!/^\/(?!\/)/.test(value))
    throw new TypeError(`${what} must be a path on the app, such as "/": got ${value}`);
  return value;
}

/** The manifest, with what installing needs and what opening an installed app from core needs (RFC 0001 A5, A7). */
export function manifest(options: ManifestOptions): WebAppManifest {
  const startUrl = ownPath(options.startUrl ?? '/', 'startUrl');
  const background = options.backgroundColor ?? '#ffffff';
  return {
    id: ownPath(options.id ?? startUrl, 'id'),
    name: options.name,
    short_name: options.shortName ?? shortName(options.name),
    ...(options.description ? { description: options.description } : {}),
    start_url: startUrl,
    scope: ownPath(options.scope ?? '/', 'scope'),
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: background,
    theme_color: options.themeColor ?? background,
    icons: options.icons ?? iconSet(),
    launch_handler: { client_mode: options.clientMode ?? ['navigate-existing', 'auto'] },
    handle_links: options.handleLinks ?? 'preferred',
    lang: options.lang ?? 'en',
    dir: options.dir ?? 'ltr',
    ...(options.categories ? { categories: options.categories } : {}),
    ...(options.shortcuts ? { shortcuts: options.shortcuts } : {}),
  };
}
