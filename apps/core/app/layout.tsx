import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { getConfig } from '../src/config';
import { getInstanceIdentity } from '../src/instance/service';
import { THEME_COLORS } from '../src/pwa';
import { ServiceWorkerRegistration } from './service-worker-registration';
import { THEME_SCRIPT } from '../src/theme-script';
import './globals.css';

/**
 * How the page meets the device's screen: it runs to the edges (and the safe areas, in globals.css, keep what
 * matters out of the notch), and the browser's bar takes the page's colour in the system's colour scheme.
 */
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getInstanceIdentity();
  return {
    metadataBase: new URL(getConfig().url),
    title: { default: identity.name, template: `%s · ${identity.name}` },
    // An iPhone reads this, not the manifest, to open a page added to the home screen without Safari's bars.
    appleWebApp: { capable: true, title: identity.name, statusBarStyle: 'black-translucent' },
    // The instance's own favicon and app icon, or the Sovereign ones until it sets them.
    icons: {
      icon: identity.favicon
        ? identity.favicon
        : [
            { url: '/icons/favicon.svg', type: 'image/svg+xml' },
            { url: '/favicon.ico', sizes: 'any' },
          ],
      apple: identity.appIcon ?? '/icons/apple-touch-icon.png',
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the request's headers makes every page render per request, which a
  // nonce-based Content Security Policy needs: a prerendered page has no nonce.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
