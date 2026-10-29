// Generated from spec/core-api/openapi.yaml by scripts/generate-api-client.ts. Do not edit it: change the contract and run `pnpm generate:api-client`.

import type { DirectoryUser, DirectoryUserStatus, InstanceBranding } from './schema';

/** What each operation takes and answers with. */
export interface Operations {
  /**
   * Find one person by their whole email address
   */
  findDirectoryUserByEmail: {
    request: { query: { email: string } };
    response: DirectoryUser;
  };
  /**
   * The instance's name, logos and favicon
   */
  getInstanceBranding: {
    request: undefined;
    response: InstanceBranding;
  };
  /**
   * Look people up by their `sub`
   */
  resolveDirectoryUsers: {
    request: {
      body: {
        /**
         * The `sub` of each person. 1 to 100, each at most 255 characters.
         */
        subs: string[];
      };
    };
    response: {
      users: DirectoryUserStatus[];
    };
  };
  /**
   * Search for people by name
   */
  searchDirectoryUsers: {
    request: { query: { q: string; limit?: number } };
    response: {
      users: DirectoryUser[];
    };
  };
}

/** How each operation is called. `scopes` is undefined for a public one. */
export const operations = {
  findDirectoryUserByEmail: {
    method: 'GET',
    path: '/api/v1/directory/users/by-email',
    scopes: ['directory'],
  },
  getInstanceBranding: {
    method: 'GET',
    path: '/.well-known/sovereign-instance',
    scopes: undefined,
  },
  resolveDirectoryUsers: {
    method: 'POST',
    path: '/api/v1/directory/users/resolve',
    scopes: ['directory'],
  },
  searchDirectoryUsers: {
    method: 'GET',
    path: '/api/v1/directory/users',
    scopes: ['directory'],
  },
} as const;
