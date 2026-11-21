import { personFromClaims, type User } from '@sovereignfs/sdk';

/** What better-auth's session says of its person: the preset's fields (auth.md §4). */
export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  image?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

/** What core said of a person on this session: its `sub`, and the claims of the ID token it signed, checked when it was received. */
export type CoreFacts = { sub: string; claims: Readonly<Record<string, unknown>> };

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);

/**
 * Who is signed in, typed (sdk §9.9, auth.md §6): the same shape as the SDK's `session.user`, for an account of the app's own and for
 * one that came through core. What the app keeps of the person comes first; core's claims fill in what it does not keep. `roles`
 * come only from what core signed for this session, never from the account or a request.
 */
export function userOf(user: SessionUser, core?: CoreFacts): User {
  const fromCore = core ? personFromClaims(core.claims) : undefined;
  const fields = {
    sub: core?.sub,
    name: text(user.name) ?? fromCore?.name,
    email: text(user.email) ?? fromCore?.email,
    emailVerified:
      typeof user.emailVerified === 'boolean' ? user.emailVerified : fromCore?.emailVerified,
    picture: text(user.image) ?? fromCore?.picture,
    locale: text(user.locale) ?? fromCore?.locale,
    zoneinfo: text(user.timezone) ?? fromCore?.zoneinfo,
  };
  return {
    id: user.id,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
    roles: fromCore?.roles ?? [],
  };
}
