import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { needsCoreCheck, signedInUser } from '@sovereignfs/auth/core';
import { sessionGuards } from '@sovereignfs/auth/next';
import { readSession, userOf, type User } from '@sovereignfs/auth/server';
import { signIn } from './sign-in';

/** The signed-in person's session for this request, or nothing (auth.md §6). Every page, action and route reads it here. */
export async function getSession() {
  const { auth } = await signIn();
  return readSession(auth, await headers());
}

const guards = sessionGuards({
  getSession,
  // A session that came from core is checked against it at most an hour after the last check (sdk §9.7).
  onPage: async (session) => {
    const { database, ways } = await signIn();
    if (ways.core && (await needsCoreCheck(database, session.session.id))) {
      redirect('/api/auth/sign-in/sovereign?prompt=none');
    }
  },
});

/** The guard of every page that needs someone signed in: their session, or the sign-in page with the way back. */
export const requireSignedIn = guards.requireSignedIn;

/** For the sign-in and sign-up pages: someone already signed in goes on. */
export const sendOnIfSignedIn = guards.sendOnIfSignedIn;

/**
 * Who is signed in, typed (sdk §9.9): `id` is this app's id for them, and with core as a way in, `sub` and the roles core signed
 * for one who came through it. Read people from this rather than from the session's raw fields.
 */
export async function userOfSession(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
): Promise<User> {
  const { database, ways } = await signIn();
  return ways.core ? signedInUser(database, session) : userOf(session.user);
}
