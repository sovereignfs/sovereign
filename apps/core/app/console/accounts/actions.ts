'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AccountActionError, getAccountManager } from '../../../src/accounts';
import { requireCapability } from '../../../src/auth/authorize';
import { getDatabase } from '../../../src/database';
import { changeRole, RoleChangeError } from '../../../src/roles/people';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** What an expected refusal says to the operator; anything else is a fault and is thrown. */
function said(error: unknown): ActionResult {
  if (error instanceof AccountActionError || error instanceof RoleChangeError) {
    return { ok: false, error: error.message };
  }
  throw error;
}

const refresh = (id: string) => {
  revalidatePath('/console/accounts');
  revalidatePath(`/console/accounts/${id}`);
};

/**
 * Each action is a public endpoint whatever the page around it checks, so each asks for its capability itself,
 * first, and the rules about whom an operator may act on are held by the manager and `changeRole`, not by the
 * page that offered the button.
 */
export async function deactivateAction(
  id: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const session = await requireCapability('user:manage');
  try {
    const manager = await getAccountManager();
    const { changed } = await manager.deactivate(session.user, id);
    refresh(id);
    return {
      ok: true,
      message: changed ? 'The account is deactivated.' : 'It was already deactivated.',
    };
  } catch (error) {
    return said(error);
  }
}

export async function reactivateAction(
  id: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const session = await requireCapability('user:manage');
  try {
    const manager = await getAccountManager();
    const { changed } = await manager.reactivate(session.user, id);
    refresh(id);
    return {
      ok: true,
      message: changed ? 'The account can sign in again.' : 'It was not deactivated.',
    };
  } catch (error) {
    return said(error);
  }
}

export async function resetMfaAction(
  id: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const session = await requireCapability('user:manage');
  try {
    const manager = await getAccountManager();
    const { notified } = await manager.resetMfa(session.user, id);
    refresh(id);
    return {
      ok: true,
      message: notified
        ? 'Two-factor sign-in is reset, and they have been emailed.'
        : 'Two-factor sign-in is reset. Email is not set up, so tell them yourself.',
    };
  } catch (error) {
    return said(error);
  }
}

export async function deleteAction(
  id: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const session = await requireCapability('user:manage');
  try {
    const manager = await getAccountManager();
    await manager.delete(session.user, id);
  } catch (error) {
    return said(error);
  }
  revalidatePath('/console/accounts');
  redirect('/console/accounts');
}

export async function changeRoleAction(
  id: string,
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireCapability('role:assign');
  try {
    const { changed } = await changeRole(await getDatabase(), session.user, id, form.get('role'));
    refresh(id);
    return { ok: true, message: changed ? 'The role is changed.' : 'It already had that role.' };
  } catch (error) {
    return said(error);
  }
}
