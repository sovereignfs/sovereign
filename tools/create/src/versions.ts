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
  '@sovereignfs/config': '^0.1.0',
  '@sovereignfs/pwa': '^0.1.0',
  // 2.8 checks a session against core (`checkEverySeconds`), which the template turns on.
  '@sovereignfs/sdk': '^2.8.0',
  '@sovereignfs/storage': '^0.1.0',
  '@sovereignfs/ui': '^0.102.0',
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
  '@sovereignfs/sdk': '^2.5.0',
} as const;

export const APP_DEV_DEPENDENCIES = {
  // Makes the image's label and port from the manifest, and checks the manifest (`sovereign-manifest`).
  '@sovereignfs/manifest': '^0.3.0',
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
