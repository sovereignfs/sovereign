'use server';

import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';
import { createNote } from './_lib/data';

/**
 * Expected failures return this shape and render inline (useActionState) —
 * they never throw, so bad input can't blow the page into the 500 boundary
 * (the repo's error-UX convention).
 */
export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function addNote(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await sdk.auth.getSession();
  if (!session) return { ok: false, error: 'Your session expired. Refresh and sign in again.' };

  const label = String(formData.get('label') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!label) return { ok: false, error: 'Give the note a label — it is what you search by.' };
  if (!body) return { ok: false, error: 'The note needs some content.' };

  await createNote({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    label,
    body,
  });
  revalidatePath('/example-encrypted');
  return { ok: true };
}
