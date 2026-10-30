'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '../../src/auth/authorize';
import { getMailForAppsService } from '../../src/mail';

export type EmailSwitchResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Switches an app's emails on or off for the signed-in person (core-app §4.2). A server action is a public endpoint whatever the
 * page around it checks, so it asks for the capability itself, first, and acts on the caller's own account only: the app is named
 * by id and the account is the session's.
 */
export async function setAppEmailAction(
  clientId: string,
  enabled: boolean,
): Promise<EmailSwitchResult> {
  const session = await requireCapability('profile:manage');
  const service = await getMailForAppsService();
  // Only an app that can email this person has a switch: any other id is not theirs to set.
  const apps = await service.apps(session.user.id);
  if (!apps.some((app) => app.clientId === clientId)) {
    return { ok: false, error: 'That app cannot email you.' };
  }
  await service.setEnabled(session.user.id, clientId, enabled);
  revalidatePath('/preferences');
  return { ok: true, message: enabled ? 'On.' : 'Off.' };
}
