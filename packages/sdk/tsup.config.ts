import { defineConfig } from 'tsup';

export default defineConfig({
  // e2ee-crypto/e2ee-device are browser-only (WebCrypto/IndexedDB) and must
  // stay a separate entry — the main index.ts pulls in server-only modules
  // (e.g. activity.ts's `next/headers` import), which breaks any 'use client'
  // component that imports from the barrel instead of these subpaths.
  entry: ['src/index.ts', 'src/e2ee-crypto.ts', 'src/e2ee-device.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
