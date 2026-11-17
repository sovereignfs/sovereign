'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCapability } from '../../../../src/auth/authorize';
import { getShortcutManager } from '../../../../src/shortcuts';
import {
  refusedForm,
  shortcutFromForm,
  type ShortcutFormResult,
} from '../../../../src/shortcuts/form';

/**
 * Shortcuts for everyone (core-app §3.8.1). Each action is a public endpoint whatever the page around it checks,
 * so each asks for `client:manage` itself, first; the manager asks again against the matrix in force. A success
 * goes back to the list of apps, and the launcher is drawn afresh for everyone.
 */
async function done(): Promise<never> {
  revalidatePath('/console/apps');
  revalidatePath('/');
  redirect('/console/apps');
}

export async function createSharedShortcutAction(
  _previous: ShortcutFormResult | null,
  form: FormData,
): Promise<ShortcutFormResult> {
  const session = await requireCapability('client:manage');
  try {
    await (await getShortcutManager()).create(session.user, 'shared', await shortcutFromForm(form));
  } catch (error) {
    return refusedForm(error);
  }
  return done();
}

export async function updateSharedShortcutAction(
  id: string,
  _previous: ShortcutFormResult | null,
  form: FormData,
): Promise<ShortcutFormResult> {
  const session = await requireCapability('client:manage');
  try {
    await (
      await getShortcutManager()
    ).update(session.user, 'shared', id, await shortcutFromForm(form));
  } catch (error) {
    return refusedForm(error);
  }
  return done();
}

export async function removeSharedShortcutAction(
  id: string,
  _previous: ShortcutFormResult | null,
): Promise<ShortcutFormResult> {
  const session = await requireCapability('client:manage');
  try {
    await (await getShortcutManager()).remove(session.user, 'shared', id);
  } catch (error) {
    return refusedForm(error);
  }
  return done();
}
