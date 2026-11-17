'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCapability } from '../../src/auth/authorize';
import { getShortcutManager } from '../../src/shortcuts';
import { refusedForm, shortcutFromForm, type ShortcutFormResult } from '../../src/shortcuts/form';

/**
 * A person's own shortcuts (core-app §3.8.1). Each action is a public endpoint, so each asks for
 * `launcher:access` itself, first, and acts only for the session's own account: the manager finds a shortcut by its
 * id and the person's together, so another person's is "not found".
 */
async function done(): Promise<never> {
  revalidatePath('/shortcuts');
  revalidatePath('/');
  redirect('/shortcuts');
}

export async function createOwnShortcutAction(
  _previous: ShortcutFormResult | null,
  form: FormData,
): Promise<ShortcutFormResult> {
  const session = await requireCapability('launcher:access');
  try {
    await (await getShortcutManager()).create(session.user, 'own', await shortcutFromForm(form));
  } catch (error) {
    return refusedForm(error);
  }
  return done();
}

export async function updateOwnShortcutAction(
  id: string,
  _previous: ShortcutFormResult | null,
  form: FormData,
): Promise<ShortcutFormResult> {
  const session = await requireCapability('launcher:access');
  try {
    await (
      await getShortcutManager()
    ).update(session.user, 'own', id, await shortcutFromForm(form));
  } catch (error) {
    return refusedForm(error);
  }
  return done();
}

export async function removeOwnShortcutAction(
  id: string,
  _previous: ShortcutFormResult | null,
): Promise<ShortcutFormResult> {
  const session = await requireCapability('launcher:access');
  try {
    await (await getShortcutManager()).remove(session.user, 'own', id);
  } catch (error) {
    return refusedForm(error);
  }
  return done();
}
