'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { files } from '@/lib/files';
import { StorageError } from '@sovereignfs/storage';

/** Every server action is a public POST endpoint, so each one asks who is calling before it does anything. */
export async function addNote(formData: FormData): Promise<void> {
  const session = await auth().requireSession('/');
  const body = String(formData.get('body') ?? '')
    .trim()
    .slice(0, 2000);
  if (body === '') return;
  await db().query('INSERT INTO notes (owner, body) VALUES ($1, $2)', [session.sub, body]);
  revalidatePath('/');
}

export async function deleteNote(formData: FormData): Promise<void> {
  const session = await auth().requireSession('/');
  const id = Number(formData.get('id'));
  if (!Number.isSafeInteger(id)) return;
  // Only the person's own: the owner is part of the condition and not a check made before it.
  await db().query('DELETE FROM notes WHERE id = $1 AND owner = $2', [id, session.sub]);
  revalidatePath('/');
}

export async function deleteFile(formData: FormData): Promise<void> {
  const session = await auth().requireSession('/');
  try {
    // Only the person's own: the store is asked for the person's folder, so another person's file is a file that is not there.
    await files().remove(session.sub, String(formData.get('id') ?? ''));
  } catch (error) {
    if (!(error instanceof StorageError && error.code === 'not_found')) throw error;
  }
  revalidatePath('/');
}
