'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuth } from '../../../src/auth';
import { requireCapability } from '../../../src/auth/authorize';
import { confirmPassword } from '../../../src/auth/confirm-password';
import { getDatabase } from '../../../src/database';
import { OwnershipTransferError, transferOwnership } from '../../../src/roles/ownership';

export type TransferResult = { ok: true } | { ok: false; error: string };

/**
 * Hands the instance to an admin. A public endpoint like every action, so it asks for `ownership:transfer`
 * itself, first; `transferOwnership` asks again, asks for the owner's password, and holds the rules about who
 * may receive it. A refusal is returned for the dialog to show; success leaves the page, which the previous
 * owner may no longer open.
 */
export async function transferOwnershipAction(
  _previous: TransferResult | null,
  form: FormData,
): Promise<TransferResult> {
  const session = await requireCapability('ownership:transfer');
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  try {
    const database = await getDatabase();
    const auth = await getAuth();
    await transferOwnership(
      database,
      session.user,
      { targetId: text('target'), newRole: text('newRole'), password: text('password') },
      (id, password) => confirmPassword(database, auth, id, password),
    );
  } catch (error) {
    if (error instanceof OwnershipTransferError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath('/', 'layout');
  redirect('/console');
}
