import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

export interface PinnedFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/**
 * Like `fetch(url, init)`, but connects directly to `pinnedAddress` instead
 * of letting the HTTP client re-resolve `url`'s hostname — closes the
 * DNS-rebind window `assertSafeProviderBaseUrl`'s own validation lookup
 * would otherwise leave open if `fetch()` (or Node's own default DNS
 * resolution) ran a second, independent lookup for the real connection.
 *
 * `url.hostname` is still sent as the `Host` header and, for `https:`, as
 * the TLS SNI/`servername` — both default from Node's `host`/`hostname`
 * request options, which we deliberately leave set to the original
 * hostname. Only DNS *resolution* is overridden (via the `lookup` request
 * option), so the peer certificate is still validated against the hostname
 * the operator actually configured, not the pinned IP.
 *
 * Built on Node's core `http`/`https` modules rather than a `fetch()`
 * dispatcher override, since `node:undici` is not available as a built-in
 * module on every supported Node build and this deliberately avoids adding
 * a new runtime dependency for one security fix.
 */
export function pinnedFetch(
  url: URL,
  pinnedAddress: string,
  pinnedFamily: 4 | 6,
  init: PinnedFetchInit = {},
): Promise<Response> {
  const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        host: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? 'GET',
        headers: init.headers,
        // Pin DNS resolution to the already-validated address instead of
        // letting Node resolve `hostname` again for this connection. Node's
        // http/https `request()` always calls `lookup` with `{ all: true }`
        // regardless of what a caller passes, so the callback must return
        // the array-of-addresses shape (`dns.lookup(host, {all:true}, cb)`),
        // not the single-address `(err, address, family)` shape.
        lookup: (_hostname, _options, callback) => {
          callback(null, [{ address: pinnedAddress, family: pinnedFamily }]);
        },
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined) continue;
          for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
        }
        const body =
          init.method === 'HEAD'
            ? null
            : (Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>);
        resolve(new Response(body, { status, headers }));
      },
    );

    req.on('error', reject);

    if (init.signal) {
      if (init.signal.aborted) {
        req.destroy();
        reject(init.signal.reason ?? new Error('The request was aborted.'));
        return;
      }
      init.signal.addEventListener(
        'abort',
        () => {
          req.destroy();
          reject(init.signal?.reason ?? new Error('The request was aborted.'));
        },
        { once: true },
      );
    }

    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
