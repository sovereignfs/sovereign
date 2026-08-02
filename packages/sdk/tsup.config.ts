import { defineConfig } from 'tsup';

export default defineConfig({
  // e2ee-crypto/e2ee-device/e2ee-object/e2ee-state/offline/offline-queue are
  // browser-only (WebCrypto/IndexedDB) and must stay separate entries — the
  // main index.ts pulls in server-only modules (e.g. activity.ts's
  // `next/headers` import), which breaks any 'use client' component that
  // imports from the barrel instead of these subpaths.
  // device-bridge.ts is separate for a different reason: it's the only
  // subpath a *non-React* consumer (@sovereignfs/bridge) imports a genuine
  // runtime value from — co-locating it with device-client.ts's React hooks
  // pulled all of React into that consumer's bundle even though it's
  // unused there (React has no "sideEffects": false, so bundlers can't
  // tree-shake an unused import of it out of a shared file). Never add a
  // React import to device-bridge.ts.
  entry: [
    'src/index.ts',
    'src/device-bridge.ts',
    'src/device-client.ts',
    'src/e2ee-crypto.ts',
    'src/e2ee-device.ts',
    'src/e2ee-object.ts',
    'src/e2ee-state.ts',
    'src/offline.ts',
    'src/offline-queue.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
});
