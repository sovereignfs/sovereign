/**
 * Builds the runtime's service worker into `public/sw.js`. Runs after
 * `next build` (see `runtime/package.json`'s `build` script) — it needs the
 * finished `.next/static` tree to know what to precache.
 *
 * 1. Bundle `worker/index.ts` (Serwist + our routes + the Web Push handlers)
 *    with tsup into a single classic-worker script.
 * 2. Glob Next's content-hashed build output plus the committed PWA assets
 *    (`public/icons`, `public/manifest.json`) and the `/offline` fallback
 *    document into a precache manifest, and inject it at
 *    `self.__SW_MANIFEST` (`@serwist/build`'s `injectManifest`).
 *
 * Bundler-agnostic on purpose: nothing here cares whether `next build` used
 * Turbopack or webpack, which is what let the runtime drop
 * `@ducanh2912/next-pwa` (a webpack plugin) for the Next 16 upgrade.
 */

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getManifest, injectManifest } from '@serwist/build';
import { build } from 'tsup';

const runtimeDir = fileURLToPath(new URL('..', import.meta.url));
const nextDir = resolve(runtimeDir, '.next');
const publicDir = resolve(runtimeDir, 'public');
const bundleDir = resolve(nextDir, 'sw');

// Artefacts `@ducanh2912/next-pwa` used to emit next to sw.js. Gone from
// .gitignore, so a checkout that built with the old toolchain would otherwise
// show them as untracked forever.
for (const name of readdirSync(publicDir)) {
  if (/^(workbox-|fallback-|worker-).*\.js(\.map)?$/.test(name) || name === 'sw.js.map') {
    rmSync(resolve(publicDir, name), { force: true });
  }
}

const buildIdPath = resolve(nextDir, 'BUILD_ID');
if (!existsSync(buildIdPath)) {
  console.error('[build-sw] .next/BUILD_ID not found — run `next build` first.');
  process.exit(1);
}
const buildId = readFileSync(buildIdPath, 'utf8').trim();

await build({
  config: false,
  entry: { sw: resolve(runtimeDir, 'worker/index.ts') },
  outDir: bundleDir,
  clean: true,
  format: ['iife'],
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  silent: true,
  // A service worker has no module graph to defer to — inline every import.
  noExternal: [/.*/],
  tsconfig: resolve(runtimeDir, 'tsconfig.json'),
  outExtension: () => ({ js: '.js' }),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
});

// Committed PWA assets. Revisioned by content hash (they carry no hash in
// their file names), so a changed icon is re-fetched on the next install.
const publicAssets = await getManifest({
  globDirectory: publicDir,
  globPatterns: ['icons/**/*.{png,svg,ico}', 'manifest.json'],
  modifyURLPrefix: { '': '/' },
});

const result = await injectManifest({
  swSrc: resolve(bundleDir, 'sw.js'),
  swDest: resolve(publicDir, 'sw.js'),
  injectionPoint: 'self.__SW_MANIFEST',
  globDirectory: resolve(nextDir, 'static'),
  globPatterns: ['**/*.{js,css,woff,woff2,ttf,otf,svg,png,jpg,jpeg,gif,webp,avif,ico,json,txt}'],
  globIgnores: ['**/*.map'],
  modifyURLPrefix: { '': '/_next/static/' },
  // Content-hashed by Next (or scoped under the build id): no `__WB_REVISION__`
  // query needed, so the precache entry key equals the URL the page requests.
  dontCacheBustURLsMatching: /^\/_next\/static\//,
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  additionalPrecacheEntries: [
    ...(publicAssets.manifestEntries ?? []),
    // The document every failed navigation falls back to (worker/index.ts).
    { url: '/offline', revision: buildId },
  ],
});

for (const warning of [...publicAssets.warnings, ...result.warnings]) {
  console.warn(`[build-sw] ${warning}`);
}
console.log(
  `[build-sw] public/sw.js: ${result.count} precache entries, ${Math.round(result.size / 1024)} KiB`,
);
