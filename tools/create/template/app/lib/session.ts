import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { needsCoreCheck } from '@sovereignfs/auth/core';
import { sessionGuards } from '@sovereignfs/auth/next';
import { readSession } from '@sovereignfs/auth/server';
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
