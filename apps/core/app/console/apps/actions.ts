'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireCapability } from '../../../src/auth/authorize';
import { ClientRegistryError, getClientRegistry } from '../../../src/clients';
import {
  appFromForm,
  fieldProblems,
  newAppFromForm,
  type FieldProblems,
} from '../../../src/clients/form';

export type AppFormResult =
  | { ok: true; message: string; id?: string; secret?: string }
  | { ok: false; error: string; fields: FieldProblems };

export type AppActionResult =
  { ok: true; message: string; secret?: string } | { ok: false; error: string };

/** What an expected refusal says to the operator; anything else is a fault and is thrown. */
function refused(error: unknown): { ok: false; error: string; fields: FieldProblems } {
  if (error instanceof ClientRegistryError) {
    return { ok: false, error: error.message, fields: fieldProblems(error.problems) };
  }
  throw error;
}

const stopped = (error: unknown): { ok: false; error: string } => {
  const { error: message } = refused(error);
  return { ok: false, error: message };
};

/** The registry judges who is asking from the account and from the request's own cookies. */
async function asker() {
  const session = await requireCapability('client:manage');
  return { user: session.user, headers: await headers() };
}

/**
 * Each action is a public endpoint whatever the page around it checks, so each asks for `client:manage`
 * itself, first; the registry asks again against the matrix in force and holds every rule about what an app
 * may be. A secret is in the result of the call that made it and nowhere else, and is shown once.
 */
export async function registerAppAction(
  _previous: AppFormResult | null,
  form: FormData,
): Promise<AppFormResult> {
  const actor = await asker();
  try {
    const { client, secret } = await (
      await getClientRegistry()
    ).register(actor, newAppFromForm(form));
    revalidatePath('/console/apps');
    return {
      ok: true,
      message: secret
        ? 'The app is added. Copy its secret now: it is shown once.'
        : 'The app is added.',
      id: client.clientId,
      ...(secret ? { secret } : {}),
    };
  } catch (error) {
    return refused(error);
  }
}

export async function updateAppAction(
  id: string,
  _previous: AppFormResult | null,
  form: FormData,
): Promise<AppFormResult> {
  const actor = await asker();
  try {
    await (await getClientRegistry()).update(actor, id, appFromForm(form));
    revalidatePath('/console/apps');
    revalidatePath(`/console/apps/${id}`);
    return { ok: true, message: 'The changes are saved.' };
  } catch (error) {
    return refused(error);
  }
}

export async function setAppEnabledAction(
  id: string,
  enabled: boolean,
  _previous: AppActionResult | null,
): Promise<AppActionResult> {
  const actor = await asker();
  try {
    await (await getClientRegistry()).setEnabled(actor, id, enabled);
    revalidatePath('/console/apps');
    revalidatePath(`/console/apps/${id}`);
    return {
      ok: true,
      message: enabled ? 'The app is on again.' : 'The app is switched off.',
    };
  } catch (error) {
    return stopped(error);
  }
}

export async function rotateSecretAction(
  id: string,
  _previous: AppActionResult | null,
): Promise<AppActionResult> {
  const actor = await asker();
  try {
    const secret = await (await getClientRegistry()).rotateSecret(actor, id);
    return {
      ok: true,
      message:
        'There is a new secret. The old one has stopped working. Copy this one now: it is shown once.',
      secret,
    };
  } catch (error) {
    return stopped(error);
  }
}

export async function deleteAppAction(
  id: string,
  _previous: AppActionResult | null,
): Promise<AppActionResult> {
  const actor = await asker();
  try {
    await (await getClientRegistry()).remove(actor, id);
  } catch (error) {
    return stopped(error);
  }
  revalidatePath('/console/apps');
  redirect('/console/apps');
}
