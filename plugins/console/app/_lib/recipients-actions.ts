'use server';

import { sdk, type DirectoryUser } from '@sovereignfs/sdk';
import { requireCapability } from './authz';

/**
 * Directory search for the Broadcast/Messages recipient picker. Gated on
 * `console:access` — the same capability `/api/account/broadcast` and
 * `/api/inbox/admin-messages` themselves require — so anyone who can send
 * can also pick, and nobody else can enumerate the directory through it.
 */
export async function searchRecipientsAction(query: string): Promise<DirectoryUser[]> {
  await requireCapability('console:access', 'Insufficient privileges to search recipients.');
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return sdk.directory.searchUsers({ query: trimmed, limit: 8 });
}
