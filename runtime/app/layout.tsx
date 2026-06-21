import '@sovereignfs/ui/tokens.css';
import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { DEFAULT_TENANT_ID, getPlatformDb, getTenantBranding } from '@sovereignfs/db';
import { themeScript } from '@/src/theme-script';

// Resolved at request time so the page <title> reflects the operator's brand
// name whether it was set via DB (Console Settings) or BRAND_NAME env. Falls
// back to 'Sovereign' when the DB is unavailable (e.g. during build).
export async function generateMetadata(): Promise<Metadata> {
  let name = process.env.BRAND_NAME ?? 'Sovereign';
  try {
    const pdb = await getPlatformDb();
    const branding = await getTenantBranding(pdb, DEFAULT_TENANT_ID);
    name = branding.brandName;
  } catch {
    // Metadata is cosmetic — never crash on a failed DB read.
  }
  return {
    title: name,
    description: 'Your self-hosted workspace.',
    // Installable PWA (SRS §3.11, PLT-09). The web manifest + icons live in
    // public/; the service worker is generated there at build by next-pwa.
    manifest: '/manifest.json',
    appleWebApp: { capable: true, title: name, statusBarStyle: 'black-translucent' },
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/apple-touch-icon.png',
    },
  };
}

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
