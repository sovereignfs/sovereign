'use server';

import { revalidatePath } from 'next/cache';
import { StorageError } from '@sovereignfs/storage';
import { requireCapability } from '../../src/auth/authorize';
import { getFileStore } from '../../src/files';

export type DeleteFileResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes one of the signed-in person's files and gives its space back. A server action is a public endpoint whatever the page around
 * it checks, so it asks for the capability itself, first, and acts on the caller's own folder only: the file is named by id and the
 * person is the session's, so someone else's file is one that is not there.
 */
export async function deleteFileAction(
  id: string,
  _previous: DeleteFileResult | null,
): Promise<DeleteFileResult> {
  const session = await requireCapability('files:manage');
  try {
    await getFileStore().remove(session.user.id, id);
  } catch (error) {
    // Already gone, which is what was asked for.
    if (!(error instanceof StorageError && error.code === 'not_found')) throw error;
  }
  revalidatePath('/files');
  return { ok: true };
}
