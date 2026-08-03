import type { ReactNode } from 'react';

/**
 * This service serves no HTML — only the JSON API routes under app/v1/*
 * (RFC 0085). A root layout is still required by Next's App Router
 * conventions; it renders nothing beyond its children.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
