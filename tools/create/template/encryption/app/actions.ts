'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { coreSignOutUrl } from '@sovereignfs/auth/core';
import { requirePerson } from '@/lib/person';
import { getSession } from '@/lib/session';
import { signIn } from '@/lib/sign-in';
import { sovereign } from '@/lib/sovereign';
import { files } from '@/lib/files';
import { StorageError } from '@sovereignfs/storage';

// The notes are written by the page itself, encrypted, through /api/notes (app/notes.tsx): the server never sees them in the clear.

/**
 * Signs out, through core's sign-out, which decides whether it ends core's session too (core-app §3.6.5). The session's key secret
 * goes with the session (auth.md §8.1), so the key this browser kept opens nothing afterwards.
 */
export async function signOut(): Promise<void> {
  const session = await getSession();
  const { auth, database } = await signIn();
  const throughCore = session
    ? await coreSignOutUrl(database, sovereign(), session.session.id)
    : undefined;
  await auth.api.signOut({ headers: await headers() });
  redirect(throughCore ?? '/sign-in');
}

/** Every server action is a public POST endpoint, so each one asks who is calling before it does anything. */
export async function deleteFile(formData: FormData): Promise<void> {
  const session = await requirePerson('/');
  try {
    // Only the person's own: the store is asked for the person's folder, so another person's file is a file that is not there.
    await files().remove(session.sub, String(formData.get('id') ?? ''));
  } catch (error) {
    if (!(error instanceof StorageError && error.code === 'not_found')) throw error;
  }
  revalidatePath('/');
}
