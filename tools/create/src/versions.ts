/**
 * The versions an app made by `npm create @sovereignfs app` depends on. The two Sovereign packages are ranges that include the release
 * this one was made with; a test holds them to the packages in this repository, so they cannot drift from what the template was
 * written against.
 */
export const APP_DEPENDENCIES = {
  // `@sovereignfs/ui` is one bundle that imports these two, which it lists as optional peers: an app has to have them for the bundle to load.
  '@dnd-kit/core': '^6.3.1',
  '@dnd-kit/sortable': '^10.0.0',
  '@sovereignfs/sdk': '^2.0.0',
  '@sovereignfs/ui': '^0.89.1',
  next: '^16.4.3',
  pg: '^8.23.1',
  react: '^19.3.1',
  'react-dom': '^19.3.1',
} as const;

export const APP_DEV_DEPENDENCIES = {
  '@types/node': '^24.19.2',
  '@types/pg': '^8.23.1',
  '@types/react': '^19.3.0',
  '@types/react-dom': '^19.3.0',
  typescript: '~6.0.3',
} as const;
