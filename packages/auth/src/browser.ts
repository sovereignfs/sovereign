/**
 * `@sovereignfs/auth/server` and `/next` as a browser sees them: they throw on import (auth.md §2). They hold the app's secret, its
 * database and better-auth's server, none of which may reach a page; what a page may use is the package's root.
 */
throw new Error(
  '@sovereignfs/auth/server and @sovereignfs/auth/next run on a server and must not be imported in a browser. ' +
    'A page uses @sovereignfs/auth (the cookie names, the password policy, the checks that run anywhere).',
);
