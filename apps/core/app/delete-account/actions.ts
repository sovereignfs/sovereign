'use server';

import { redirect } from 'next/navigation';
import { AccountActionError, getAccountManager } from '../../src/accounts';
import { getAuth } from '../../src/auth';
import { requireCapability } from '../../src/auth/authorize';
import { confirmPassword } from '../../src/auth/confirm-password';
import { getDatabase } from '../../src/database';

export type DeleteResult = { ok: false; error: string };

/**
 * Deletes the signed-in person's own account (core-app §3.3.6, §3.11). A server action is a public endpoint
 * whatever the page around it checks, so it asks for the capability itself, first, and acts on the session's own
 * account only: nothing in the request names whose it is. It asks for the password again, counted and limited
 * (`confirmPassword`), because this cannot be undone. On success the account, its sessions and every token are gone, and
 * the person goes to sign-in, which says so. The owner is refused by `deleteSelf`, which tells them to hand the
 * instance over first; the page does not offer them the form, so only a request made by hand gets that far.
 */
export async function deleteAccountAction(
  _previous: DeleteResult | null,
  form: FormData,
): Promise<DeleteResult> {
  const session = await requireCapability('profile:manage');
  const password = form.get('password');
  try {
    const manager = await getAccountManager();
    const account = session.user;
    const check = await confirmPassword(
      await getDatabase(),
      await getAuth(),
      account.id,
      typeof password === 'string' ? password : '',
    );
    if (check === 'limited') {
      return { ok: false, error: 'Too many wrong passwords. Wait a few minutes, then try again.' };
    }
    if (check !== 'ok') return { ok: false, error: 'That password is not right.' };
    await manager.deleteSelf({ id: account.id, role: account.role });
  } catch (error) {
    if (error instanceof AccountActionError) return { ok: false, error: error.message };
    throw error;
  }
  redirect('/sign-in?deleted=1');
}
