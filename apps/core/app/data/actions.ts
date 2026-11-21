'use server';

import { revalidatePath } from 'next/cache';
import { getAuth } from '../../src/auth';
import { requireCapability } from '../../src/auth/authorize';
import { confirmPassword } from '../../src/auth/confirm-password';
import { getDatabase } from '../../src/database';
import { coreFilesRoot } from '../../src/files';
import { ExportBusyError } from '@sovereignfs/export';
import { removeExportFiles } from '../../src/exports/make';
import { getExportJobs, runDueExports } from '../../src/exports/service';

export type ExportResult = { ok: true } | { ok: false; error: string };

/**
 * Asks for a person's own export (core-app §4.7.2), for the session's own account: nothing in the request names whose. A public endpoint
 * whatever the page checks, so it asks for `profile:manage` itself, then the password again (`confirmPassword`, counted). A zip unless
 * the form asks for a tar.
 */
export async function startPersonExportAction(
  _previous: ExportResult | null,
  form: FormData,
): Promise<ExportResult> {
  const session = await requireCapability('profile:manage');
  const password = form.get('password');
  const check = await confirmPassword(
    await getDatabase(),
    await getAuth(),
    session.user.id,
    typeof password === 'string' ? password : '',
  );
  if (check === 'limited')
    return { ok: false, error: 'Too many wrong passwords. Wait a few minutes, then try again.' };
  if (check !== 'ok') return { ok: false, error: 'That password is not right.' };
  try {
    const { replaced } = await (
      await getExportJobs()
    ).request({
      kind: 'person',
      sub: session.user.id,
      sessionId: session.session.id,
      archive: form.get('archive') === 'tar' ? 'tar' : 'zip',
    });
    await removeExportFiles(coreFilesRoot(), replaced);
  } catch (error) {
    if (error instanceof ExportBusyError)
      return { ok: false, error: 'Your export is already being made. Wait for it to finish.' };
    throw error;
  }
  void runDueExports();
  revalidatePath('/data');
  return { ok: true };
}
