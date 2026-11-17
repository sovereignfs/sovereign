'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { files } from '@/lib/files';
import { StorageError } from '@sovereignfs/storage';

// The notes are written by the page itself, encrypted, through /api/notes (app/notes.tsx): the server never sees them in the clear.

/** Every server action is a public POST endpoint, so each one asks who is calling before it does anything. */
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
