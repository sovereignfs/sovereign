/**
 * The package as a browser sees it: it throws on import. The app's key must never reach a page; a page turns push on with
 * `@sovereignfs/pwa/client`, which asks the app's own route.
 */
throw new Error(
  '@sovereignfs/push runs on a server and must not be imported in a browser: turn push on from a page with @sovereignfs/pwa/client.',
);
