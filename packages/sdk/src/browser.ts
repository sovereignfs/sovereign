/**
 * The root entry as a browser sees it: it throws on import (sdk §3). Tokens must not reach a browser, so a page that needs
 * something from core asks its own server. The one public thing, the instance document, a page may fetch directly.
 */
throw new Error(
  '@sovereignfs/sdk runs on a server and must not be imported in a browser: ask your own server for what the page needs. ' +
    'The instance document at /.well-known/sovereign-instance is public and a page may fetch it directly.',
);
