import '@sovereignfs/ui/tokens.css';
import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { themeScript } from '@/src/theme-script';

export const metadata: Metadata = {
  title: 'Sovereign',
  description: 'Your self-hosted workspace.',
  // Installable PWA (SRS §3.11, PLT-09). The dynamic manifest route returns
  // the correct brand name from the DB; the static public/manifest.json is
  // kept for @ducanh2912/next-pwa build-time tooling only.
  manifest: '/api/manifest',
  appleWebApp: { capable: true, title: 'Sovereign', statusBarStyle: 'black-translucent' },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  // viewport-fit=cover allows content to extend into the notch/corner areas
  // (safe-area insets compensate in CSS with env(safe-area-inset-*)). Required
  // for the immersive black-translucent status bar on iOS standalone (RFC 0013).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme on <html> before hydration, so the
    // attribute intentionally differs from the server markup —
    // suppressHydrationWarning scopes React's mismatch check off this element
    // (the standard theming pattern; suppression does not extend to children).
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
