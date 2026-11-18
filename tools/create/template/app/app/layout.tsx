import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { pwaMetadata, pwaViewport } from '@sovereignfs/pwa';
import { ServiceWorkerRegistration } from '@sovereignfs/pwa/client';
import '@sovereignfs/ui/tokens.css';
import './globals.css';

// What a device is told to install the app and open it as one (`@sovereignfs/pwa`): an iPhone reads these, not the manifest.
export const metadata: Metadata = { title: '__TITLE__', ...pwaMetadata({ name: '__TITLE__' }) };
export const viewport: Viewport = pwaViewport();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Registers the service worker in production, and says when a new version is ready. */}
        <ServiceWorkerRegistration appName="__TITLE__" />
      </body>
    </html>
  );
}
