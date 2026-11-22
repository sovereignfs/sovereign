import pkg from '../package.json' with { type: 'json' };

/**
 * The versions an app made by `npm create @sovereignfs app` depends on. The two Sovereign packages are ranges that include the release
 * this one was made with; a test holds them to the packages in this repository, so they cannot drift from what the template was
 * written against.
 */
export const APP_DEPENDENCIES = {
  // `@sovereignfs/ui` is one bundle that imports these two, which it lists as optional peers: an app has to have them for the bundle to load.
  '@dnd-kit/core': '^6.3.1',
  '@dnd-kit/sortable': '^10.0.0',
  // The sign-in: the package's preset, pages' flows and core as a way in, on better-auth at the one version the package names.
  '@sovereignfs/auth': '^0.5.0',
  '@sovereignfs/config': '^0.1.0',
  // 0.2 has the worker's push handlers and `usePush`, which the template's notifications use.
  '@sovereignfs/pwa': '^0.3.0',
  // Web Push for the app's server: the key, the store's shape, the outbox and the subscription route.
  '@sovereignfs/push': '^0.2.0',
  // 2.11 answers core's export request (`handleExportRequest`), which the template mounts; 2.10 has the typed `User` the package's
  // `userOf` gives, on 2.9's sign-in for a session the app keeps (`finishSignIn`).
  '@sovereignfs/sdk': '^2.11.0',
  '@sovereignfs/storage': '^0.1.0',
  // 0.104 has `PushControl`; 0.105 writes `SessionsPanel`'s times the same on the server and in the browser.
  '@sovereignfs/ui': '^0.105.0',
  'better-auth': '1.7.27',
  next: '^16.4.6',
  pg: '^8.23.1',
  react: '^19.3.1',
  'react-dom': '^19.3.1',
} as const;

/**
 * What an app made with `--encryption` needs on top: the SDK release whose `/keys` encrypts a document (sdk §9.4). Held to this
 * repository's SDK by the same test.
 */
export const ENCRYPTION_DEPENDENCIES = {
  '@sovereignfs/sdk': '^2.11.0',
} as const;

/** What an app made with `--encryption` does not depend on: it signs in with the SDK's `nextAuth`, as it did before the package. */
export const ENCRYPTION_LEAVES_OUT = ['@sovereignfs/auth', 'better-auth'] as const;

export const APP_DEV_DEPENDENCIES = {
  // Makes the image's label and port from the manifest, and checks the manifest (`sovereign-manifest`).
  '@sovereignfs/manifest': '^0.4.0',
  '@types/node': '^24.19.2',
  '@types/pg': '^8.23.1',
  '@types/react': '^19.3.0',
  '@types/react-dom': '^19.3.0',
  typescript: '~6.0.3',
} as const;

/** This package's own version, which an app pins exactly so `sync` and the shared workflows run the same checks for everyone. */
export const CREATE_VERSION: string = pkg.version;

/**
 * The commit of sovereignfs/sovereign whose shared workflows (`app-promotion.yml`, `app-release.yml`) an app calls. Moved here, by a
 * commit of its own, when they change; an app takes it with its next `npm create @sovereignfs sync`.
 */
export const SHARED_WORKFLOWS_REF = 'ef1ddb5f623ba702fc34c8769b4b2f98c6f61ed8';

/**
 * The managers an app made with pnpm or Yarn pins in its `packageManager` field, which corepack reads in the image and in CI. pnpm is the one
 * this repository uses (a test holds them together); Yarn is the latest 4.
 */
export const PNPM_VERSION = '11.28.9';
export const YARN_VERSION = '4.18.1';
