'use server';

import { sdk } from '@sovereignfs/sdk';
import {
  createBackupDestination,
  type BackupDestinationAuthType,
} from '../_lib/backup-destinations';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const AGE_RECIPIENT_PREFIX = 'age1';

function isAuthType(value: FormDataEntryValue | null): value is BackupDestinationAuthType {
  return value === 'https-token' || value === 'ssh-key';
}

/**
 * Connects a personal git backup destination (workstream 0023 leg 2). The
 * age recipient (public key) is generated entirely client-side and arrives
 * here as plain text — this action never sees, generates, or stores a
 * private identity, matching workstream 0023's "Sovereign never holds a
 * private key" invariant. Push logic (leg 3) is not part of this action.
 */
export async function connectBackupDestinationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await sdk.auth.requireSession();

  const label = (formData.get('label') as string | null)?.trim() ?? '';
  const repoUrl = (formData.get('repoUrl') as string | null)?.trim() ?? '';
  const branch = (formData.get('branch') as string | null)?.trim() ?? '';
  const authTypeRaw = formData.get('authType');
  const credential = (formData.get('credential') as string | null)?.trim() ?? '';
  const ageRecipient = (formData.get('ageRecipient') as string | null)?.trim() ?? '';

  if (label.length === 0) return { ok: false, error: 'Give this destination a name.' };
  if (repoUrl.length === 0) {
    return { ok: false, error: 'Enter the git repository URL.' };
  }
  if (!/^(https:\/\/|git@|ssh:\/\/)/.test(repoUrl)) {
    return {
      ok: false,
      error: 'Enter a valid repository URL (https://… or git@…).',
    };
  }
  if (branch.length === 0) return { ok: false, error: 'Enter a branch name.' };
  if (!isAuthType(authTypeRaw)) return { ok: false, error: 'Choose an access method.' };
  if (credential.length === 0) {
    return {
      ok: false,
      error:
        authTypeRaw === 'ssh-key'
          ? 'Paste the SSH private key for this repository.'
          : 'Paste an access token for this repository.',
    };
  }
  if (!ageRecipient.startsWith(AGE_RECIPIENT_PREFIX)) {
    return {
      ok: false,
      error: 'Generate a backup key above before connecting a destination.',
    };
  }

  try {
    await createBackupDestination({
      label,
      repoUrl,
      branch,
      authType: authTypeRaw,
      credential,
      ageRecipient,
    });
  } catch (error) {
    // Not something the requester can act on beyond retrying, but an
    // operator needs to be able to find it — logged server-side before
    // falling back to the generic message, matching plugins/warden/app/
    // actions.ts's own `messageFor()` precedent for this exact shape.
    console.error('[account] connectBackupDestinationAction failed unexpectedly:', error);
    return {
      ok: false,
      error: 'Could not connect that destination. Check the details and try again.',
    };
  }

  return { ok: true, message: 'Backup destination connected.' };
}
