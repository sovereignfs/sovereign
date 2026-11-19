import {
  authorizationResponse,
  requireSameOrigin,
  requireSession,
} from '../../../../src/auth/authorize';
import { currentLock } from '../../../../src/auth/session';
import { getDatabase } from '../../../../src/database';
import { lockSession, noteActivity } from '../../../../src/lock/store';

export const dynamic = 'force-dynamic';

const done = (status = 204): Response =>
  new Response(null, { status, headers: { 'cache-control': 'no-store' } });

/**
 * What an open page tells core about the lock (RFC 0006 B2), sent by the lock watcher: `activity`, the person is using the page, so the
 * idle time starts again (written at most each half minute); `leave`, the page was hidden, which locks the session if this device's lock
 * asks for that. Both are the session's own, need it unlocked, and come only from core's pages.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ event: string }> },
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const session = await requireSession();
    const { event } = await params;
    if (event !== 'activity' && event !== 'leave') return done(404);
    const { lock } = await currentLock(session);
    // No lock on this device: nothing to note.
    if (!lock) return done();
    const database = await getDatabase();
    if (event === 'activity') await noteActivity(database, session.session.id);
    else if (lock.onLeave) await lockSession(database, session.session.id);
    return done();
  } catch (error) {
    const refused = authorizationResponse(error);
    if (refused) return refused;
    throw error;
  }
}
