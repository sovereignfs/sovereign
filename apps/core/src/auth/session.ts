import { headers } from 'next/headers';
import { getAuth } from './index';

/** The signed-in person's session for the current request, or `null`. Server components only. */
export async function getSession() {
  return (await getAuth()).api.getSession({ headers: await headers() });
}
