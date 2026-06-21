import { NextResponse } from 'next/server';
import { getPlatformDb } from '@sovereignfs/db';
import { DEFAULT_TENANT_ID, getTenantBranding } from '@sovereignfs/db';

/**
 * Dynamic web app manifest — returns the PWA manifest with the tenant's brand
 * name instead of the hardcoded "Sovereign" default. Excluded from the
 * middleware session gate (browsers fetch the manifest before the user logs in).
 * The static public/manifest.json is kept for @ducanh2912/next-pwa build-time
 * tooling; this route is the authoritative one for browsers.
 */
export async function GET(): Promise<Response> {
  let brandName = process.env.BRAND_NAME ?? 'Sovereign';
  let description = 'Your self-hosted workspace.';

  try {
    const pdb = await getPlatformDb();
    const branding = await getTenantBranding(pdb, DEFAULT_TENANT_ID);
    if (branding.brandName) {
      brandName = branding.brandName;
      description = `${brandName} — your self-hosted workspace.`;
    }
  } catch {
    // Branding is cosmetic — serve a working manifest even on DB failure.
  }

  const manifest = {
    name: brandName,
    short_name: brandName,
    description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#09090b',
    theme_color: '#09090b',
    orientation: 'any',
    categories: ['productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Launcher',
        short_name: 'Apps',
        description: 'Open the app launcher',
        url: '/launcher',
      },
      {
        name: 'Account',
        short_name: 'Account',
        description: 'Manage your profile and preferences',
        url: '/account',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
