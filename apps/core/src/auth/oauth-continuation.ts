/**
 * When core's sign-in page is opened by the OAuth provider, because an app asked for a sign-in
 * (core-app §3.6.1), the address carries the app's request, signed by the provider (`sig`). Signing in
 * with that request in the body makes the provider carry on with it and answer `{ redirect: true, url }`:
 * the address to send the browser to, which is the app with its authorization code.
 *
 * These are free of the browser and of the server, so the forms and their tests can both use them.
 */

/** Whether an address's query is the provider's signed request. */
export function isContinuation(search: string): boolean {
  return new URLSearchParams(search).has('sig');
}

/** Where the provider says to go next, in the answer to a sign-in step, or nothing when it says nothing. */
export function continuationUrl(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { redirect, url } = data as { redirect?: unknown; url?: unknown };
  return redirect === true && typeof url === 'string' && url !== '' ? url : undefined;
}
