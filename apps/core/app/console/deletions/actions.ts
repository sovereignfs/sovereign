'use server';

import { revalidatePath } from 'next/cache';
import { resolveNotice } from '../../../src/accounts/deletion-delivery';
import { requireCapability } from '../../../src/auth/authorize';
import { getDatabase } from '../../../src/database';

export type ResolveResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Marks a notice resolved: the app's owner says what it held of the person is gone by other means (core-app §4.5). A server action
 * is a public endpoint whatever the page around it checks, so it asks for `client:manage` itself, first. The notice is named by id,
 * and what it touches is only the notice.
 */
export async function resolveNoticeAction(id: string): Promise<ResolveResult> {
  await requireCapability('client:manage');
  const done = await resolveNotice(await getDatabase(), id);
  revalidatePath('/console/deletions');
  return done
    ? { ok: true, message: 'Marked as done.' }
    : { ok: false, error: 'That notice is already done or gone.' };
}
