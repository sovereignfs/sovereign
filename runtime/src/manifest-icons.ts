import type { InstanceConfig } from '@sovereignfs/db';

export const DEFAULT_MANIFEST_ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: '/icons/icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
};

/** Best-effort MIME type from a URL's extension; defaults to PNG (most uploads are PNG). */
export function guessMimeType(url: string): string {
  const ext = (url.split('?')[0] ?? '').split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'image/png';
}

/**
 * The operator's logo isn't pre-sized like the default icon set (a single
 * upload, arbitrary dimensions) — declared without a fixed `sizes` value so
 * consuming OSes treat it as a generic "any" icon rather than assuming a
 * specific pixel grid. Placed first so installers prefer the operator's own
 * mark over the Sovereign default when both are present.
 */
export function buildManifestIcons(config: InstanceConfig): Array<Record<string, string>> {
  if (!config.instanceLogo) return DEFAULT_MANIFEST_ICONS;
  return [
    { src: config.instanceLogo, sizes: 'any', type: guessMimeType(config.instanceLogo) },
    ...DEFAULT_MANIFEST_ICONS,
  ];
}
