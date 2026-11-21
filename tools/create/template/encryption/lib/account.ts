import { auth } from './auth';

/** The signed-in person's `sub`, or nothing: what the push route and actions act for. */
export async function currentAccount(): Promise<string | undefined> {
  return (await auth().getSession())?.sub;
}
