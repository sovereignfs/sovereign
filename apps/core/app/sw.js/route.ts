import { SERVICE_WORKER_SOURCE } from '../../src/sw/source';

/**
 * The service worker (RFC 0001). It is public, since a browser fetches it with no session, and the same for
 * everyone. It is served as a route rather than a file in a `public` folder, so the image needs no folder of static
 * files beside it. It is never cached by the browser's own cache, so a change is fetched on the next start, and its
 * scope is the whole origin.
 */
export function GET(): Response {
  return new Response(SERVICE_WORKER_SOURCE, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
      'x-content-type-options': 'nosniff',
    },
  });
}
