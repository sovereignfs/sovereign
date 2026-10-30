'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '../../src/auth/authorize';
import { getNotificationService } from '../../src/notifications';

export type NotificationResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Switches an app's notifications on or off for the signed-in person (core-app §4.1). A server action is a public endpoint whatever
 * the page around it checks, so it asks for the capability itself, first, and acts on the caller's own account only: the app is
 * named by id and the account is the session's.
 */
export async function setAppNotificationsAction(
  clientId: string,
  enabled: boolean,
): Promise<NotificationResult> {
  const session = await requireCapability('profile:manage');
  const service = await getNotificationService();
  // Only an app that can write to this person has a switch: any other id is not theirs to set.
  const apps = await service.apps(session.user.id);
  if (!apps.some((app) => app.clientId === clientId)) {
    return { ok: false, error: 'That app cannot send you notifications.' };
  }
  await service.setEnabled(session.user.id, clientId, enabled);
  revalidatePath('/preferences');
  return { ok: true, message: enabled ? 'On.' : 'Off.' };
}

/** Clears every notification the signed-in person has, from every app. */
export async function clearNotificationsAction(): Promise<NotificationResult> {
  const session = await requireCapability('profile:manage');
  const cleared = await (await getNotificationService()).clearAll(session.user.id);
  revalidatePath('/preferences');
  return {
    ok: true,
    message: cleared === 0 ? 'There was nothing to clear.' : 'Your notifications are cleared.',
  };
}
