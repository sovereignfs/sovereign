import { coreSubOf } from '@sovereignfs/auth/core';
import { getSession, requireSignedIn } from './session';
import { signIn } from './sign-in';

/** A person as this app keeps everything of theirs: by the `sub` core knows them by, which their keys and their notes are for. */
export type Person = { sub: string; name: string };

async function personOf(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const { database } = await signIn();
  // Found from the account each time, never kept: auth.md §8.1. An account of the app's own has none, and no keys here.
  const sub = await coreSubOf(database, session.user.id);
  return sub ? { sub, name: session.user.name } : null;
}

/** The signed-in person, or nothing: for routes, which answer 401 themselves. */
export async function person(): Promise<Person | null> {
  const session = await getSession();
  return session ? personOf(session) : null;
}

/** The signed-in person, for a page: the sign-in page with the way back when there is none. */
export async function requirePerson(returnTo: string): Promise<Person> {
  const found = await personOf(await requireSignedIn(returnTo));
  if (!found)
    throw new Error('This app keeps notes only for people who sign in through Sovereign.');
  return found;
}
