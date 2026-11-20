'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { coreSignOutUrl } from '@sovereignfs/auth/core';
import { getSession } from '@/lib/session';
import { signIn, waysIn } from '@/lib/sign-in';
import { sovereign } from '@/lib/sovereign';
import { db } from '@/lib/db';
import { files } from '@/lib/files';
import { StorageError } from '@sovereignfs/storage';

/** The signed-in person, or the sign-in page: every server action is a public POST endpoint, so each one asks who is calling first. */
async function signedIn() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  return session;
}

/**
 * Signs out. A session that came from core goes on through core's sign-out, which decides whether it ends core's session too
 * (core-app §3.6.5); the address is read before the session ends, since it goes with it.
 */
export async function signOut(): Promise<void> {
  const session = await getSession();
  const { auth, database } = await signIn();
  const throughCore =
    session && waysIn().core
      ? await coreSignOutUrl(database, sovereign(), session.session.id)
      : undefined;
  await auth.api.signOut({ headers: await headers() });
  redirect(throughCore ?? '/sign-in');
}

export async function addNote(formData: FormData): Promise<void> {
  const session = await signedIn();
  const body = String(formData.get('body') ?? '')
    .trim()
    .slice(0, 2000);
  if (body === '') return;
  await db().query('INSERT INTO notes (owner, body) VALUES ($1, $2)', [session.user.id, body]);
  revalidatePath('/');
}

export async function deleteNote(formData: FormData): Promise<void> {
  const session = await signedIn();
  const id = Number(formData.get('id'));
  if (!Number.isSafeInteger(id)) return;
  // Only the person's own: the owner is part of the condition and not a check made before it.
  await db().query('DELETE FROM notes WHERE id = $1 AND owner = $2', [id, session.user.id]);
  revalidatePath('/');
}

export async function deleteFile(formData: FormData): Promise<void> {
  const session = await signedIn();
  try {
    // Only the person's own: the store is asked for the person's folder, so another person's file is a file that is not there.
    await files().remove(session.user.id, String(formData.get('id') ?? ''));
  } catch (error) {
    if (!(error instanceof StorageError && error.code === 'not_found')) throw error;
  }
  revalidatePath('/');
}
