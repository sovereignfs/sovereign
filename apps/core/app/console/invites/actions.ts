'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '../../../src/auth/authorize';
import { InviteError } from '../../../src/invites/manage';
import { getInviteManager, inviteLink } from '../../../src/invites/service';

export type InviteResult =
  { ok: true; message: string; link?: string } | { ok: false; error: string };

export type CancelResult = { ok: true; message: string } | { ok: false; error: string };

/** What an expected refusal says to the operator; anything else is a fault and is thrown. */
function said(error: unknown): { ok: false; error: string } {
  if (error instanceof InviteError) return { ok: false, error: error.message };
  throw error;
}

/** The expiry as typed: empty is no expiry; anything that is not a whole number is refused by the manager. */
function daysOf(value: FormDataEntryValue | null): number | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? undefined : Number(text);
}

/**
 * Each action is a public endpoint whatever the page around it checks, so each asks for its capability
 * itself, first; the manager asks again against the matrix in force.
 */
export async function inviteAction(
  _previous: InviteResult | null,
  form: FormData,
): Promise<InviteResult> {
  const session = await requireCapability('user:manage');
  const email = form.get('email');
  const days = daysOf(form.get('days'));
  try {
    const manager = await getInviteManager();
    const { invite, sent } = await manager.create(session.user, {
      email: typeof email === 'string' ? email : '',
      days,
    });
    revalidatePath('/console/invites');
    return sent
      ? { ok: true, message: `We have emailed an invitation to ${invite.email}.` }
      : {
          ok: true,
          message: `${invite.email} is invited, but email is not set up, so nothing was sent. Pass this link on yourself:`,
          link: await inviteLink(invite.id),
        };
  } catch (error) {
    return said(error);
  }
}

export async function cancelInviteAction(
  id: string,
  _previous: CancelResult | null,
): Promise<CancelResult> {
  const session = await requireCapability('user:manage');
  try {
    const manager = await getInviteManager();
    const { changed } = await manager.cancel(session.user, id);
    revalidatePath('/console/invites');
    return {
      ok: true,
      message: changed ? 'The invitation is cancelled.' : 'It was already cancelled.',
    };
  } catch (error) {
    return said(error);
  }
}
