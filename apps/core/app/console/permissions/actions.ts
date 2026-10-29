'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '../../../src/auth/authorize';
import { ROLE_ADMIN, ROLE_USER } from '../../../src/auth/roles';
import { getDatabase } from '../../../src/database';
import { ALL_CAPABILITIES, CAPABILITIES } from '../../../src/roles/capabilities';
import {
  CapabilityChangeError,
  changeCapabilities,
  resetCapabilities,
  type CapabilityChange,
} from '../../../src/roles/configure';

export type MatrixResult = { ok: true; message: string } | { ok: false; error: string };

function said(error: unknown): MatrixResult {
  if (error instanceof CapabilityChangeError) return { ok: false, error: error.message };
  throw error;
}

const changed = (count: number): string =>
  count === 0
    ? 'Nothing was different.'
    : count === 1
      ? 'One change is saved. It applies at once.'
      : `${count} changes are saved. They apply at once.`;

/**
 * Saves the whole table the owner saw: a capability is given to a role when its box was ticked and taken away
 * when it was not. Every cell the owner may edit is sent, so what is saved is what the owner saw and not a
 * guess at what they meant to change. The owner-only capabilities are not in the table's boxes at all.
 */
export async function saveMatrixAction(
  _previous: MatrixResult | null,
  form: FormData,
): Promise<MatrixResult> {
  const session = await requireCapability('capability:configure');
  const ticked = new Set(form.getAll('grant').map(String));
  const changes: CapabilityChange[] = [];
  for (const capability of ALL_CAPABILITIES) {
    if (CAPABILITIES[capability].ownerOnly) continue;
    for (const role of [ROLE_ADMIN, ROLE_USER]) {
      changes.push({ role, capability, granted: ticked.has(`${role}|${capability}`) });
    }
  }
  try {
    const result = await changeCapabilities(await getDatabase(), session.user, changes);
    revalidatePath('/console', 'layout');
    return { ok: true, message: changed(result.changed) };
  } catch (error) {
    return said(error);
  }
}

export async function resetMatrixAction(_previous: MatrixResult | null): Promise<MatrixResult> {
  const session = await requireCapability('capability:configure');
  try {
    const result = await resetCapabilities(await getDatabase(), session.user);
    revalidatePath('/console', 'layout');
    return {
      ok: true,
      message:
        result.changed === 0
          ? 'It was already as the defaults say.'
          : 'Every role is back to the defaults.',
    };
  } catch (error) {
    return said(error);
  }
}
