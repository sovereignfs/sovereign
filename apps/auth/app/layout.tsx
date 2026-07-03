import '@sovereignfs/ui/tokens.css';
import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';

const sans = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--sv-font-family',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--sv-font-family-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sovereign',
  description: 'Sign in to your Sovereign workspace.',
  generator: 'Sovereign',
};

// Render per-request so the middleware's CSP nonce is injected into Next's
// inline scripts (a statically-prerendered page can't carry a per-request
// nonce). The auth app is tiny and gains nothing from static optimisation.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
