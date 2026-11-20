'use server';

import { headers } from 'next/headers';
import type { ActionResult } from '@sovereignfs/ui';
import { endOtherSessions, endSession } from '@sovereignfs/auth/server';
import { getSession } from '@/lib/session';
import { signIn } from '@/lib/sign-in';

/**
 * Ends one of the signed-in person's sessions. A server action is a public endpoint whatever the page around it checks, so it reads
 * the session itself, and acts only on the person's own: the session is named by id, and one that is not theirs is not found.
 */
export async function endSessionAction(
  sessionId: string,
  _previous: ActionResult | null,
  _form: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Sign in again to do that.' };
  const { auth, database } = await signIn();
  const ended = await endSession(auth, database, session.user.id, sessionId, await headers());
  return ended ? { ok: true } : { ok: false, error: 'That session has already ended.' };
}

/** Ends every session of the person's but this one. */
export async function endOtherSessionsAction(
  _previous: ActionResult | null,
  _form: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Sign in again to do that.' };
  const { auth, database } = await signIn();
  const count = await endOtherSessions(
    auth,
    database,
    session.user.id,
    session.session.id,
    await headers(),
  );
  return {
    ok: true,
    message:
      count === 1 ? 'Signed out of 1 other session.' : `Signed out of ${count} other sessions.`,
  };
}
