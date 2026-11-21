'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '../../../src/auth/authorize';
import { InstanceError } from '../../../src/instance/manage';
import { getInstanceManager } from '../../../src/instance/service';

export type DataResult = { ok: true; message: string } | { ok: false; error: string };

function said(error: unknown): DataResult {
  if (error instanceof InstanceError) return { ok: false, error: error.message };
  throw error;
}

const text = (value: FormDataEntryValue | null): string => (typeof value === 'string' ? value : '');

/**
 * Saves the keys the owner's export is encrypted to (core-app §4.7.1). Each action is a public endpoint, so it asks for its capability
 * itself; the manager asks again against the matrix in force.
 */
export async function saveExportKeysAction(
  _previous: DataResult | null,
  form: FormData,
): Promise<DataResult> {
  const session = await requireCapability('instance:configure-secrets');
  try {
    await (
      await getInstanceManager()
    ).setExportRecipients(session.user, text(form.get('recipients')));
    revalidatePath('/console/data');
    return { ok: true, message: 'The keys are saved. Exports are encrypted to them from now on.' };
  } catch (error) {
    return said(error);
  }
}

/** Forgets the keys, and with them the owner's export, until new ones are saved. */
export async function clearExportKeysAction(_previous: DataResult | null): Promise<DataResult> {
  const session = await requireCapability('instance:configure-secrets');
  try {
    await (await getInstanceManager()).setExportRecipients(session.user, undefined);
    revalidatePath('/console/data');
    return {
      ok: true,
      message: 'The keys are removed. No export can be taken until new ones are saved.',
    };
  } catch (error) {
    return said(error);
  }
}
