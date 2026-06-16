import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface Manifest {
  name: string;
  start_url: string;
  display: string;
  icons: Icon[];
}

// vitest runs from the repo root.
const manifest = JSON.parse(
  readFileSync(join('runtime', 'public', 'manifest.json'), 'utf8'),
) as Manifest;

describe('PWA web manifest', () => {
  it('declares the installability basics', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('provides 192 and 512 "any" icons (Chrome installability)', () => {
    const sizes = manifest.icons.filter((i) => i.purpose !== 'maskable').map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('provides a 512 maskable icon (Android adaptive)', () => {
    const maskable = manifest.icons.find((i) => i.purpose === 'maskable');
    expect(maskable?.sizes).toBe('512x512');
  });

  it('references icons under /icons/ as PNGs', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/icons/')).toBe(true);
      expect(icon.type).toBe('image/png');
    }
  });
});
