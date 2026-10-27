import type { Client } from '@libsql/client';

/** The longest a single request to sqld may take. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** What sqld accepts as a namespace name; also safe in a URL path. */
const NAMESPACE = /^[a-z][a-z0-9_]{0,62}$/;

export function assertNamespace(namespace: string): void {
  if (!NAMESPACE.test(namespace)) {
    throw new Error(
      'An sqld namespace is lower-case letters, digits and underscores, starting with a letter, at most 63 characters.',
    );
  }
}

type FetchLike = (request: Request) => Promise<Response>;

/**
 * A libSQL client for one sqld namespace.
 *
 * **Every request names its namespace in `x-namespace`, `default` included.** With
 * namespaces enabled and no header, sqld takes the namespace from the first DNS label of
 * the `Host` header, so `http://127.0.0.1:8080` is read as the namespace "127" and
 * answers 404. Sending the header on every request makes the host in the URL irrelevant.
 * Routing by header needs sqld 0.24.33 or later.
 *
 * `@libsql/client` is imported here, not at the top of the package: its native addon
 * loads at import, and a PostgreSQL deployment, or a musl image without a matching
 * binary, must never load it.
 */
export async function createSqldClient(
  url: string,
  namespace: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Client> {
  assertNamespace(namespace);
  const { createClient } = await import('@libsql/client');
  return createClient({
    url,
    // libSQL calls this with a `Request`, headers and body included. Merge into it:
    // passing `headers` in the init would replace the request's own (its content type,
    // an authorization header).
    fetch: (input: unknown, init?: RequestInit) => {
      const original = new Request(input as string | URL | Request, init);
      // A request that never answers must not hold a page render open forever. The
      // controller and its timer are held here on purpose: a timeout signal that nothing
      // else references can be garbage-collected before it fires.
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error(`sqld did not answer within ${timeoutMs} ms`)),
        timeoutMs,
      );
      const abortWithCaller = () => controller.abort(original.signal.reason);
      if (original.signal.aborted) abortWithCaller();
      else original.signal.addEventListener('abort', abortWithCaller, { once: true });

      const request = new Request(original, { signal: controller.signal });
      request.headers.set('x-namespace', namespace);
      return fetchImpl(request).finally(() => {
        clearTimeout(timer);
        original.signal.removeEventListener('abort', abortWithCaller);
      });
    },
  });
}

/**
 * Creates a namespace through sqld's admin API. Safe to repeat: sqld answers 400 for a
 * namespace that exists, which counts as success.
 */
export async function createNamespace(
  adminUrl: string,
  namespace: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  assertNamespace(namespace);
  const response = await fetchImpl(
    `${adminUrl.replace(/\/$/, '')}/v1/namespaces/${namespace}/create`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.ok || response.status === 400) return;
  throw new Error(
    `sqld did not create the namespace "${namespace}": it answered ${response.status}`,
  );
}

/** Drops a namespace through the admin API. Safe to repeat: a namespace that is already gone counts as dropped. */
export async function dropNamespace(
  adminUrl: string,
  namespace: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  assertNamespace(namespace);
  const response = await fetchImpl(`${adminUrl.replace(/\/$/, '')}/v1/namespaces/${namespace}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.ok || response.status === 404) return;
  throw new Error(`sqld did not drop the namespace "${namespace}": it answered ${response.status}`);
}
