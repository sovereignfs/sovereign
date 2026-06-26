/**
 * Generates branded app icons (black rounded square + white "S") to replace
 * the placeholder grid icons in runtime/public/icons/.
 */
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const sharp = require(
  path.resolve('node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js'),
);

// Brand colours matching --sv-grey-950 and white
const BG = '#0a0a0a';
const FG = '#ffffff';

function iconSvg(size, letter = 'S') {
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.58);
  const baseline = Math.round(size * 0.72);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <text x="${size / 2}" y="${baseline}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="${FG}"
        text-anchor="middle" dominant-baseline="auto">${letter}</text>
</svg>`;
}

// Maskable: letter fills less of the safe zone (80% safe area per spec)
function maskableSvg(size, letter = 'S') {
  const radius = 0; // full bleed square — OS clips to circle/squircle
  const fontSize = Math.round(size * 0.46);
  const baseline = Math.round(size * 0.64);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <text x="${size / 2}" y="${baseline}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="${FG}"
        text-anchor="middle" dominant-baseline="auto">${letter}</text>
</svg>`;
}

async function gen(svgStr, outPath) {
  await sharp(Buffer.from(svgStr)).png().toFile(outPath);
  console.log('✓', outPath);
}

await gen(iconSvg(192), 'runtime/public/icons/icon-192.png');
await gen(iconSvg(512), 'runtime/public/icons/icon-512.png');
await gen(maskableSvg(512), 'runtime/public/icons/icon-maskable-512.png');
await gen(iconSvg(180), 'runtime/public/icons/apple-touch-icon.png');

// SVG favicon for runtime/public/ (referenced by layout.tsx)
import { writeFileSync } from 'fs';
writeFileSync('runtime/public/icons/favicon.svg', iconSvg(64));
console.log('✓ runtime/public/icons/favicon.svg');

console.log('Done.');
