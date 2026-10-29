import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { getConfig } from '../src/config';
import { getInstanceIdentity } from '../src/instance/service';
import { THEME_SCRIPT } from '../src/theme-script';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getInstanceIdentity();
  return {
    metadataBase: new URL(getConfig().url),
    title: { default: identity.name, template: `%s · ${identity.name}` },
    ...(identity.favicon ? { icons: { icon: identity.favicon } } : {}),
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
      <body>{children}</body>
    </html>
  );
}
