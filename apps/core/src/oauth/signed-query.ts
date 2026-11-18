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

/** What the provider adds to an app's request to sign it, and keeps out of the request itself. */
const SIGNING_PARAMETERS = new Set(['sig', 'exp', 'ba_iat', 'ba_pl', 'ba_param']);

/** The provider's authorization endpoint, as a path on core. */
const AUTHORIZE_PATH = '/api/auth/oauth2/authorize';

/**
 * Where to send someone so an app's sign-in carries on once they have a session: the app's own request to
 * the authorization endpoint, rebuilt from what the provider signed into the page's address.
 *
 * The signed request lasts ten minutes and travels only on `/sign-in` and its second step, so it was lost
 * on sign-up, a verification email and a password reset. This address is not: it is a path on core, carried
 * as `returnTo` like any other, and the provider checks it all again when it is opened (the app, its return
 * address, the scopes, PKCE), so it can send the browser nowhere the app's own request could not. `login`
 * is taken out of `prompt`, as the provider does after a sign-in: whoever opens it has just signed in.
 *
 * Nothing when the address carries no signed request, or the rebuilt address is too long to keep.
 */
export function resumeAddress(query: URLSearchParams): string | undefined {
  const signed = signedQueryOf(query);
  if (signed === undefined) return undefined;
  const request = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(signed).entries()) {
    if (!SIGNING_PARAMETERS.has(key)) request.append(key, value);
  }
  if (!request.get('client_id')) return undefined;
  const prompt = request
    .get('prompt')
    ?.split(' ')
    .filter((word) => word !== '' && word !== 'login')
    .join(' ');
  if (prompt) request.set('prompt', prompt);
  else request.delete('prompt');
  const address = `${AUTHORIZE_PATH}?${request.toString()}`;
  // `safeReturnTo` keeps nothing longer, so neither does this.
  return address.length <= 2048 ? address : undefined;
}
