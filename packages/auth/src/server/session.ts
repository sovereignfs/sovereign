/**
 * Reading the signed-in person's session (auth.md §6). Framework-free: the app gives its better-auth instance and the request's headers.
 *
 * Two steps, so an app can add a check between them (core's lock): `readSessionUnchecked` reads the session as better-auth has it,
 * and `checkSession` applies the app's check. `readSession` is both. Only the one place that decides the check may use the unchecked
 * read; everything else reads through it (core: `src/auth/session.ts`, held by a test).
 */

/** What reading a session needs of better-auth. */
export type SessionReader = {
  api: {
    getSession(input: { headers: Headers; query: { disableCookieCache: true } }): Promise<unknown>;
  };
};

/** The session `auth` gives, or nothing. */
export type SessionOf<A extends SessionReader> = Awaited<ReturnType<A['api']['getSession']>>;

/**
 * The session as better-auth has it, read from the database every time (auth.md §4, rule 8): the signed cookie cache is off in the
 * preset, and asking it not to be used here as well keeps that true if it were ever turned on, since a session that has ended (a
 * password reset, a sign-out somewhere else, a deactivation) must stop working at once.
 */
export async function readSessionUnchecked<A extends SessionReader>(
  auth: A,
  headers: Headers,
): Promise<SessionOf<A> | null> {
  const session = (await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  })) as SessionOf<A> | null;
  // Deactivating an account ends its sessions; one opened at the same moment could slip past that, so a deactivated account has no
  // session here whatever the table says (auth.md §4, rule 6).
  const user = (session as { user?: { deactivatedAt?: unknown } } | null)?.user;
  if (user?.deactivatedAt) return null;
  return session;
}

/**
 * The session, unless the app's check refuses it: `refused` says whether this session may be used now. An error in the check is
 * raised, never taken for "not refused".
 */
export async function checkSession<S>(
  session: S | null,
  refused?: (session: S) => Promise<boolean>,
): Promise<S | null> {
  if (session === null || session === undefined) return null;
  if (refused && (await refused(session))) return null;
  return session;
}

/** The signed-in person's session, read and checked: what every page, action and route of an app uses (auth.md §6). */
export async function readSession<A extends SessionReader>(
  auth: A,
  headers: Headers,
  refused?: (session: NonNullable<SessionOf<A>>) => Promise<boolean>,
): Promise<SessionOf<A> | null> {
  return checkSession(
    (await readSessionUnchecked(auth, headers)) as NonNullable<SessionOf<A>> | null,
    refused,
  );
}
