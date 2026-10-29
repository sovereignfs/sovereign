'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '../../src/auth/authorize';
import { getDatabase } from '../../src/database';
import { removeAccess } from '../../src/oauth/revocation';

export type RemoveResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Takes an app's access to the signed-in person's account away. A server action is a public endpoint
 * whatever the page around it checks, so it asks for the capability itself, first, and acts on the caller's own
 * account only: the app is named by id and the account is the session's, never anything in the request.
 * `removeAccess` deletes what they agreed to and revokes the app's tokens for them in one transaction, so the
 * next sign-in asks again and what the app already holds stops working (core-app §3.6.4).
 */
export async function removeAccessAction(
  clientId: string,
  _previous: RemoveResult | null,
): Promise<RemoveResult> {
  const session = await requireCapability('profile:manage');
  const removed = await removeAccess(await getDatabase(), session.user.id, clientId);
  revalidatePath('/connected-apps');
  return removed.consentsRemoved + removed.accessTokens + removed.refreshTokens === 0
    ? { ok: true, message: 'That app already had no access.' }
    : { ok: true, message: 'The app no longer has access to your account.' };
}
