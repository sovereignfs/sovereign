import '@sovereignfs/ui/tokens.css';
import './globals.css';
import type { ReactNode } from 'react';
import { brandName } from '@/src/brand-name';

export function generateMetadata() {
  const name = brandName();
  return {
    title: name,
    description: `Sign in to your ${name} workspace.`,
  };
}

// Render per-request so the middleware's CSP nonce is injected into Next's
// inline scripts (a statically-prerendered page can't carry a per-request
// nonce). The auth app is tiny and gains nothing from static optimisation.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
