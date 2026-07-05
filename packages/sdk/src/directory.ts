import { headers } from 'next/headers';
import { NotAuthenticatedError } from './errors';
import { requireHost } from './host';
import type { DirectoryUser, ResolveUsersInput, SearchUsersInput } from './types';

const DEFAULT_TENANT_ID = 'default';

/** Privacy-preserving user directory for member selection and sharing flows. */
export const directory = {
  /**
   * Search active users in the current tenant by display name or email.
   * Results include only display-safe profile fields.
   */
  async searchUsers(input: SearchUsersInput): Promise<DirectoryUser[]> {
    const h = await headers();
    const userId = h.get('x-sovereign-user-id');
    if (!userId) throw new NotAuthenticatedError();
    return requireHost().directory.searchUsers(input, userId, DEFAULT_TENANT_ID);
  },

  /**
   * Resolve explicit user IDs already stored by a plugin into display-safe
   * profile rows for active users.
   */
  async resolveUsers(input: ResolveUsersInput): Promise<DirectoryUser[]> {
    const h = await headers();
    const userId = h.get('x-sovereign-user-id');
    if (!userId) throw new NotAuthenticatedError();
    return requireHost().directory.resolveUsers(input, userId, DEFAULT_TENANT_ID);
  },
};
