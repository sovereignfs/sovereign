import { getSession } from './session';

/** The signed-in account's id in this app, or nothing: what the push route and actions act for. */
export async function currentAccount(): Promise<string | undefined> {
  return (await getSession())?.user.id;
}
