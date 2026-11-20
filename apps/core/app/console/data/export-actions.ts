'use server';

import { revalidatePath } from 'next/cache';
import { recipientFingerprint } from '@sovereignfs/export';
import { getAuth } from '../../../src/auth';
import { requireCapability } from '../../../src/auth/authorize';
import { confirmPassword } from '../../../src/auth/confirm-password';
import { getDatabase } from '../../../src/database';
import { coreFilesRoot } from '../../../src/files';
import { ExportBusyError } from '@sovereignfs/export';
import { removeExportFiles } from '../../../src/exports/make';
import { getExportJobs, runDueExports } from '../../../src/exports/service';
import { getInstanceManager } from '../../../src/instance/service';

export type ExportResult = { ok: true } | { ok: false; error: string };

/**
 * Asks for the owner's export of core's data (core-app §4.7.1). A public endpoint whatever the page checks, so it asks for
 * `instance:export` itself, then the password again (`confirmPassword`, counted), and refuses with no keys to encrypt to. It is logged
 * with who asked and the keys' fingerprints, and nothing of what it holds.
 */
export async function startInstanceExportAction(
  _previous: ExportResult | null,
  form: FormData,
): Promise<ExportResult> {
  const session = await requireCapability('instance:export');
  const password = form.get('password');
  const database = await getDatabase();
  const check = await confirmPassword(
    database,
    await getAuth(),
    session.user.id,
    typeof password === 'string' ? password : '',
  );
  if (check === 'limited')
    return { ok: false, error: 'Too many wrong passwords. Wait a few minutes, then try again.' };
  if (check !== 'ok') return { ok: false, error: 'That password is not right.' };
  const recipients = await (await getInstanceManager()).exportRecipients(session.user);
  if (recipients.length === 0) return { ok: false, error: 'Save the keys to encrypt to first.' };
  try {
    const { replaced } = await (
      await getExportJobs()
    ).request({
      kind: 'instance',
      sessionId: session.session.id,
      archive: 'tar.age',
    });
    await removeExportFiles(coreFilesRoot(), replaced);
  } catch (error) {
    if (error instanceof ExportBusyError)
      return { ok: false, error: 'An export is already being made. Wait for it to finish.' };
    throw error;
  }
  console.info(
    `The owner's export was asked for by ${session.user.id}, encrypted to ${recipients.map(recipientFingerprint).join(', ')}.`,
  );
  void runDueExports();
  revalidatePath('/console/data');
  return { ok: true };
}
