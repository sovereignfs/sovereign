import { defineConfig } from 'tsup';

export default defineConfig({
  // e2ee-crypto/e2ee-device/e2ee-object/e2ee-state/offline are browser-only
  // (WebCrypto/IndexedDB) and must stay separate entries — the main index.ts
  // pulls in server-only modules (e.g. activity.ts's `next/headers` import),
  // which breaks any 'use client' component that imports from the barrel
  // instead of these subpaths.
  entry: [
    'src/index.ts',
    'src/e2ee-crypto.ts',
    'src/e2ee-device.ts',
    'src/e2ee-object.ts',
    'src/e2ee-state.ts',
    'src/offline.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
});
