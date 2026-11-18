/**
 * What the root layout tells a device (RFC 0001 A7), as plain objects that fit Next's `metadata` and `viewport`: an iPhone reads
 * `appleWebApp` and the apple-touch icon, not the manifest, to open a page added to its Home Screen without Safari's bars.
 */

export type PwaMetadata = {
  appleWebApp: {
    capable: true;
    title: string;
    statusBarStyle: 'default' | 'black' | 'black-translucent';
  };
  icons: { apple: string };
};

/** `{ ...pwaMetadata({ name }) }` in the layout's metadata. The apple icon is 180 pixels, a PNG; default `/pwa-icon/apple`. */
export function pwaMetadata(options: {
  name: string;
  appleIcon?: string;
  statusBarStyle?: PwaMetadata['appleWebApp']['statusBarStyle'];
}): PwaMetadata {
  return {
    appleWebApp: {
      capable: true,
      title: options.name,
      statusBarStyle: options.statusBarStyle ?? 'default',
    },
    icons: { apple: options.appleIcon ?? '/pwa-icon/apple' },
  };
}

export type PwaViewport = {
  viewportFit: 'cover';
  themeColor: { media: string; color: string }[];
};

/** The layout's `viewport`: the page runs to the screen's edges, and the browser's bar takes the page colour of each scheme. */
export function pwaViewport(colors: { light?: string; dark?: string } = {}): PwaViewport {
  return {
    viewportFit: 'cover',
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: colors.light ?? '#ffffff' },
      { media: '(prefers-color-scheme: dark)', color: colors.dark ?? '#09090b' },
    ],
  };
}

/**
 * What a Content-Security-Policy needs for the worker and the manifest. `worker-src` falls back to `script-src`, where `'strict-dynamic'`
 * makes some browsers ignore `'self'` and refuse the worker; naming both removes the doubt.
 */
export const PWA_CSP_DIRECTIVES = ["worker-src 'self'", "manifest-src 'self'"] as const;
