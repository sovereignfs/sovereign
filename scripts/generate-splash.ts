/**
 * generate-splash — generates iOS PWA launch screens (`apple-touch-startup-image`).
 *
 * iOS does not use the manifest `background_color` for the standalone launch
 * screen; it only shows an `apple-touch-startup-image` whose media query exactly
 * matches the device (width × height × pixel-ratio × orientation). With no exact
 * match the user sees a blank white flash on launch. This script renders the
 * brand mark (`runtime/public/icons/favicon.svg`) centred on a solid surface
 * colour for every device in `DEVICES`, in both orientations and both light and
 * dark, and emits the matching `<link>` metadata. The brand mark is a dark
 * rounded square with a light letter; for the dark theme it is inverted (light
 * square, dark letter) so the mark reads against the dark surface instead of
 * dissolving into it.
 *
 * Outputs (both committed):
 *   - PNGs           → runtime/public/icons/splash/apple-splash[-dark]-{w}-{h}.png
 *   - link manifest  → runtime/src/apple-splash.ts (consumed by app/layout.tsx)
 *
 * `sharp` is a devDependency used only here — the generated PNGs are what ship,
 * so nothing native is needed at build or runtime. Run: `pnpm generate:splash`.
 * Add a device: append to `DEVICES`, then re-run.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_PATH = join(ROOT, 'runtime', 'public', 'icons', 'favicon.svg');
const OUT_DIR = join(ROOT, 'runtime', 'public', 'icons', 'splash');
const MANIFEST_PATH = join(ROOT, 'runtime', 'src', 'apple-splash.ts');
const PUBLIC_HREF_BASE = '/icons/splash';

/** Surface colours — the light/dark `--sv-color-surface` tokens. */
const SURFACE = { light: '#ffffff', dark: '#09090b' } as const;
/** The mark occupies this fraction of the shorter screen edge. */
const MARK_RATIO = 0.22;
/**
 * Mark fills in `favicon.svg`: a near-black rounded square with a white letter.
 * For the dark theme these are swapped so the mark stays visible against the
 * dark surface (light square, near-black letter) instead of dissolving into it.
 */
const MARK_SQUARE = '#0a0a0a';
const MARK_LETTER = '#ffffff';

/** Return the mark SVG for a theme — inverted (square/letter swapped) for dark. */
function themedSvg(svg: Buffer, theme: Theme): Buffer {
  if (theme === 'light') return svg;
  const swapped = svg
    .toString('utf8')
    .replaceAll(`fill="${MARK_SQUARE}"`, 'fill="__square__"')
    .replaceAll(`fill="${MARK_LETTER}"`, `fill="${MARK_SQUARE}"`)
    .replaceAll('fill="__square__"', `fill="${MARK_LETTER}"`);
  return Buffer.from(swapped);
}

interface Device {
  /** Portrait CSS width in points (the shorter edge). */
  w: number;
  /** Portrait CSS height in points (the longer edge). */
  h: number;
  /** Device pixel ratio. */
  dpr: number;
}

/**
 * Comprehensive current + recent Apple device matrix (CSS points, portrait).
 * device-width/device-height are orientation-independent on iOS, so each entry
 * yields one portrait and one landscape link differing only by `orientation`.
 */
const DEVICES: Device[] = [
  // iPhones
  { w: 320, h: 568, dpr: 2 }, // SE (1st gen), 5/5s/5c
  { w: 375, h: 667, dpr: 2 }, // SE (2nd/3rd), 8, 7, 6s, 6
  { w: 414, h: 736, dpr: 3 }, // 8 Plus, 7 Plus, 6s Plus
  { w: 375, h: 812, dpr: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { w: 414, h: 896, dpr: 2 }, // XR, 11
  { w: 414, h: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { w: 390, h: 844, dpr: 3 }, // 12, 12 Pro, 13, 13 Pro, 14
  { w: 428, h: 926, dpr: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { w: 393, h: 852, dpr: 3 }, // 14 Pro, 15, 15 Pro, 16
  { w: 430, h: 932, dpr: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { w: 402, h: 874, dpr: 3 }, // 16 Pro
  { w: 440, h: 956, dpr: 3 }, // 16 Pro Max
  // iPads
  { w: 744, h: 1133, dpr: 2 }, // mini (6th gen)
  { w: 768, h: 1024, dpr: 2 }, // mini/9.7", Air, Pro 9.7"
  { w: 810, h: 1080, dpr: 2 }, // iPad 10.2" (7/8/9)
  { w: 820, h: 1180, dpr: 2 }, // iPad 10.9" (10th gen)
  { w: 834, h: 1112, dpr: 2 }, // Air 10.5", Pro 10.5"
  { w: 834, h: 1194, dpr: 2 }, // Pro 11", Air 11" (M2)
  { w: 834, h: 1210, dpr: 2 }, // Pro 11" (M4)
  { w: 1024, h: 1366, dpr: 2 }, // Pro 12.9", Air 13" (M2)
  { w: 1032, h: 1376, dpr: 2 }, // Pro 13" (M4)
];

type Theme = keyof typeof SURFACE;
type Orientation = 'portrait' | 'landscape';

interface SplashEntry {
  url: string;
  media: string;
}

/** Render the mark as a PNG buffer at `size`×`size`, rasterised crisply. */
async function renderMark(svg: Buffer, size: number): Promise<Buffer> {
  const density = Math.min(2400, Math.ceil((size / 64) * 72));
  return sharp(svg, { density }).resize(size, size, { fit: 'contain' }).png().toBuffer();
}

function mediaQuery(device: Device, theme: Theme, orientation: Orientation): string {
  return [
    `(prefers-color-scheme: ${theme})`,
    `(device-width: ${String(device.w)}px)`,
    `(device-height: ${String(device.h)}px)`,
    `(-webkit-device-pixel-ratio: ${String(device.dpr)})`,
    `(orientation: ${orientation})`,
  ].join(' and ');
}

async function manifestFile(entries: SplashEntry[]): Promise<string> {
  const rows = entries.map((e) => `  { url: '${e.url}', media: '${e.media}' },`).join('\n');
  const source = `// Generated by scripts/generate-splash.ts — do not edit.
// iOS PWA launch screens (apple-touch-startup-image). Consumed by app/layout.tsx
// as metadata.appleWebApp.startupImage. Regenerate with \`pnpm generate:splash\`.

export interface AppleSplashScreen {
  url: string;
  media: string;
}

export const appleSplashScreens: AppleSplashScreen[] = [
${rows}
];
`;
  // Format with the repo's Prettier config so the committed file passes format:check.
  const config = await prettier.resolveConfig(MANIFEST_PATH);
  return prettier.format(source, { ...config, filepath: MANIFEST_PATH });
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const svg = readFileSync(SVG_PATH);
  const entries: SplashEntry[] = [];
  let pngCount = 0;

  for (const device of DEVICES) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      // Physical pixel canvas; landscape swaps the portrait dimensions.
      const pw = Math.round((orientation === 'portrait' ? device.w : device.h) * device.dpr);
      const ph = Math.round((orientation === 'portrait' ? device.h : device.w) * device.dpr);
      const markSize = Math.round(Math.min(pw, ph) * MARK_RATIO);

      for (const theme of Object.keys(SURFACE) as Theme[]) {
        const mark = await renderMark(themedSvg(svg, theme), markSize);
        const prefix = theme === 'dark' ? 'apple-splash-dark' : 'apple-splash';
        const file = `${prefix}-${String(pw)}-${String(ph)}.png`;
        await sharp({
          create: { width: pw, height: ph, channels: 4, background: SURFACE[theme] },
        })
          .composite([{ input: mark, gravity: 'centre' }])
          // Flat surface + a small mark palettises well; keep the files small
          // since the full set is committed.
          .png({ compressionLevel: 9, palette: true })
          .toFile(join(OUT_DIR, file));
        pngCount += 1;
        entries.push({
          url: `${PUBLIC_HREF_BASE}/${file}`,
          media: mediaQuery(device, theme, orientation),
        });
      }
    }
  }

  writeFileSync(MANIFEST_PATH, await manifestFile(entries));
  console.log(
    `[generate-splash] ${String(pngCount)} PNGs → runtime/public/icons/splash/, ` +
      `${String(entries.length)} link entries → runtime/src/apple-splash.ts`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
