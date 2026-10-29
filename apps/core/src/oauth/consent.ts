import { OAUTH_SCOPES } from './provider';
import { scopesAllowedFor } from './trust';

/**
 * What each scope means to the person, in their words and not the protocol's (core-app §3.6.4). A scope with
 * no line here is never shown, and `roles` is never offered for consent: it is for trusted apps, which are
 * not asked.
 */
export const SCOPE_COPY: Readonly<Record<string, string>> = {
  openid: 'Recognise you each time you sign in',
  profile: 'See your name, picture, language and time zone',
  email: 'See your email address',
  offline_access: 'Stay signed in without asking you again',
  directory: 'Look up the other people on this instance',
};

/** What the page shows, and what it will answer with. */
export type ConsentRequest = {
  /** The app's name, or nothing when it has none. */
  appName: string | undefined;
  /** Where the answer sends the person: the host of the address the app registered. */
  returnHost: string;
  /** The scopes to grant if the person agrees, which is the request less what an untrusted app may not have. */
  scopes: string[];
  /** One plain sentence for each scope worth saying. */
  permissions: string[];
};

export type ConsentClient = {
  name?: string | null;
  skipConsent?: boolean | null;
  disabled?: boolean | null;
};

export type ConsentDeps = {
  /** Whether the provider signed this request, and it has not expired. */
  verify: (signedQuery: string) => Promise<boolean>;
  findClient: (clientId: string) => Promise<ConsentClient | null | undefined>;
};

/**
 * Reads the request an app made, as the provider put it in the address, for the consent page. It says
 * nothing unless the provider signed the request and it has not expired, so the page never shows a name or
 * a list of scopes that someone wrote into a link; and it says nothing for a client that does not exist or
 * is switched off. `signedQuery` is the signed part of the address (`signed-query.ts`).
 */
export async function readConsentRequest(
  signedQuery: string | undefined,
  { verify, findClient }: ConsentDeps,
): Promise<ConsentRequest | undefined> {
  if (!signedQuery || !(await verify(signedQuery))) return undefined;
  const query = new URLSearchParams(signedQuery);
  const clientId = query.get('client_id');
  const redirectUri = query.get('redirect_uri');
  if (!clientId || !redirectUri) return undefined;
  const client = await findClient(clientId);
  if (!client || client.disabled === true) return undefined;
  let returnHost: string;
  try {
    returnHost = new URL(redirectUri).host;
  } catch {
    return undefined;
  }

  const known = new Set<string>(OAUTH_SCOPES);
  const requested = (query.get('scope') ?? '').split(' ').filter((name) => known.has(name));
  const scopes = scopesAllowedFor(client, [...new Set(requested)]);
  if (!scopes.includes('openid')) return undefined;
  return {
    appName: client.name?.trim() || undefined,
    returnHost,
    scopes,
    permissions: scopes.flatMap((scope) => (SCOPE_COPY[scope] ? [SCOPE_COPY[scope]] : [])),
  };
}
