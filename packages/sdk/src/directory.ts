import { headers } from 'next/headers';
import { NotAuthenticatedError } from './errors';
import { requireHost } from './host';
import type { DirectoryUser, ResolveUsersInput, SearchUsersInput } from './types';

const DEFAULT_TENANT_ID = 'default';

/**
 * The current user's id, or throws `NotAuthenticatedError` — including when
 * called outside a real Next.js request (e.g. a background job/schedule
 * handler, where `headers()` itself throws). There is no background-context
 * equivalent of "the current user" for this surface, so unlike
 * `sdk.storage`/`sdk.env`/etc. there is nothing to fall back to.
 */
async function currentUserId(): Promise<string> {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    throw new NotAuthenticatedError();
  }
  const userId = h.get('x-sovereign-user-id');
  if (!userId) throw new NotAuthenticatedError();
  return userId;
}

/** Privacy-preserving user directory for member selection and sharing flows. */
export const directory = {
  /**
   * Search active users in the current tenant by display name or email.
   * Results include only display-safe profile fields.
   */
  async searchUsers(input: SearchUsersInput): Promise<DirectoryUser[]> {
    const userId = await currentUserId();
    return requireHost().directory.searchUsers(input, userId, DEFAULT_TENANT_ID);
  },

  /**
   * Resolve explicit user IDs already stored by a plugin into display-safe
   * profile rows for active users.
   */
  async resolveUsers(input: ResolveUsersInput): Promise<DirectoryUser[]> {
    const userId = await currentUserId();
    return requireHost().directory.resolveUsers(input, userId, DEFAULT_TENANT_ID);
  },
};
