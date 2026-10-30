'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '../../src/auth/authorize';
import { getActivityService } from '../../src/activity';

export type ActivityResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Deletes one entry of the signed-in person's activity (core-app §4.3). A server action is a public endpoint whatever the page around
 * it checks, so it asks for the capability itself, first, and acts on the session's own account only: the entry is named by id, the
 * account is never anything in the request.
 */
export async function deleteActivityAction(id: string): Promise<ActivityResult> {
  const session = await requireCapability('profile:manage');
  const removed = await (await getActivityService()).delete(session.user.id, id);
  revalidatePath('/activity');
  return removed
    ? { ok: true, message: 'Deleted.' }
    : { ok: false, error: 'That entry is already gone.' };
}

/** Deletes everything one app recorded about the signed-in person, or, with no app, everything anyone recorded. */
export async function deleteAllActivityAction(clientId?: string): Promise<ActivityResult> {
  const session = await requireCapability('profile:manage');
  const service = await getActivityService();
  const removed =
    clientId === undefined
      ? await service.deleteAll(session.user.id)
      : await service.deleteApp(session.user.id, clientId);
  revalidatePath('/activity');
  return {
    ok: true,
    message: removed === 0 ? 'There was nothing to delete.' : 'Your activity is deleted.',
  };
}
