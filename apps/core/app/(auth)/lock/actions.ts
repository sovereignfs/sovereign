'use server';

import { getAuth } from '../../../src/auth';
import { requireSession } from '../../../src/auth/authorize';
import { confirmPassword } from '../../../src/auth/confirm-password';
import { getAuthSettings } from '../../../src/auth/settings';
import { getDatabase } from '../../../src/database';
import { checkPasskey, passkeyChallenge, type PasskeyRequest } from '../../../src/lock/passkey';
import { unlockSession } from '../../../src/lock/store';

/**
 * The lock page's actions (RFC 0006 B4): the only ones a locked session reaches, each for the browser's own session. Unlocking clears
 * the lock on that same session, so every app's session that hangs from it carries on.
 */

export type Unlock = { ok: true } | { ok: false; reason: 'wrong' | 'limited' };

/**
 * Unlocks with the password: the sign-in value the page made from it, checked through `confirmPassword`, which counts wrong answers with
 * every other time the password is asked (§3.2.1).
 */
export async function unlockWithPassword(value: unknown): Promise<Unlock> {
  const session = await requireSession({ evenIfLocked: true });
  const database = await getDatabase();
  const check = await confirmPassword(database, await getAuth(), session.user.id, value);
  if (check !== 'ok') return { ok: false, reason: check };
  await unlockSession(database, session.session.id);
  return { ok: true };
}

/** A passkey challenge for this session, after the person tapped Unlock; `undefined` when the account has no passkey. */
export async function unlockChallenge(): Promise<PasskeyRequest | undefined> {
  const session = await requireSession({ evenIfLocked: true });
  return passkeyChallenge(await getDatabase(), getAuthSettings().webauthn, {
    sessionId: session.session.id,
    userId: session.user.id,
  });
}

/** Unlocks with the passkey's answer to that challenge: one of the account's own, with the person verified on the device. */
export async function unlockWithPasskey(answer: unknown): Promise<Unlock> {
  const session = await requireSession({ evenIfLocked: true });
  const database = await getDatabase();
  const who = { sessionId: session.session.id, userId: session.user.id };
  if (!(await checkPasskey(database, getAuthSettings().webauthn, who, answer))) {
    return { ok: false, reason: 'wrong' };
  }
  await unlockSession(database, session.session.id);
  return { ok: true };
}
