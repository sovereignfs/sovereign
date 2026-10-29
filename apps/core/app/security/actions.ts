'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getAuth } from '../../src/auth';
import { requireCapability } from '../../src/auth/authorize';
import { getDatabase } from '../../src/database';
import { endOtherSessions, endSession } from '../../src/sessions/sessions';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Ends one of the signed-in person's sessions. A server action is a public endpoint whatever the page
 * around it checks, so it asks for the capability itself, first, and acts only on the caller's own
 * sessions: the session to end is named by id, and a session that is not theirs is simply not found.
 * Ending the session this browser is using signs this browser out, which is what ending it means.
 */
export async function endSessionAction(
  sessionId: string,
  _previous: ActionResult | null,
  _form: FormData,
): Promise<ActionResult> {
  const session = await requireCapability('profile:manage');
  const ended = await endSession(
    await getAuth(),
    await getDatabase(),
    session.user.id,
    sessionId,
    await headers(),
  );
  if (!ended) return { ok: false, error: 'That session has already ended.' };
  revalidatePath('/security');
  return { ok: true };
}

/** Ends every session of the signed-in person's except the one in use. */
export async function endOtherSessionsAction(
  _previous: ActionResult | null,
  _form: FormData,
): Promise<ActionResult> {
  const session = await requireCapability('profile:manage');
  const count = await endOtherSessions(
    await getAuth(),
    await getDatabase(),
    session.user.id,
    session.session.id,
    await headers(),
  );
  revalidatePath('/security');
  return {
    ok: true,
    message:
      count === 0
        ? 'There were no other sessions.'
        : `Ended ${count} other ${count === 1 ? 'session' : 'sessions'}.`,
  };
}
