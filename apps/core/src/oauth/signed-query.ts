/**
 * The part of a page's address that the OAuth provider signed. The provider sends someone to core's sign-in
 * or consent page with the app's request in the query, followed by `sig` and a list of the names it signed
 * (`ba_param`); a name that is not on the list (a `returnTo` core added, say) is not part of what was
 * signed. This keeps exactly what the provider's own client does (`buildSignedOAuthQuery`), so the server
 * can check the signature of what the browser would send back.
 *
 * `oauth-schema` and the consent tests drive a real request through the provider, so a change in how it
 * signs fails a test here.
 */
export function signedQueryOf(query: URLSearchParams): string | undefined {
  if (!query.has('sig')) return undefined;
  const names = new Set(query.getAll('ba_param'));
  if (names.size === 0) return undefined;
  const signed = new URLSearchParams();
  for (const [key, value] of query.entries()) {
    if (key === 'sig' || key === 'ba_param' || names.has(key)) signed.append(key, value);
  }
  return signed.toString();
}

/** A page's search parameters as a query, repeated names kept (`ba_param` is repeated). */
export function queryOf(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const each of value) query.append(key, each);
    else if (value !== undefined) query.append(key, value);
  }
  return query;
}
