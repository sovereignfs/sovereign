// Generated from spec/core-api/openapi.yaml by scripts/generate-api-client.ts. Do not edit it: change the contract and run `pnpm generate:api-client`.

import type {
  DirectoryUser,
  DirectoryUserStatus,
  InstanceBranding,
  Notification,
  NotificationCategory,
  NotificationCount,
} from './schema';

/** What each operation takes and answers with. */
export interface Operations {
  /**
   * Dismiss all of this app's notifications
   */
  dismissAllNotifications: {
    request: undefined;
    response: NotificationCount;
  };
  /**
   * Dismiss one notification
   */
  dismissNotification: {
    request: { params: { id: string } };
    response: Notification;
  };
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
   * The notifications this app sent a person
   */
  listNotifications: {
    request: { query?: { unread?: boolean; limit?: number } };
    response: {
      notifications: Notification[];
    };
  };
  /**
   * Mark all of this app's notifications read
   */
  markAllNotificationsRead: {
    request: undefined;
    response: NotificationCount;
  };
  /**
   * Mark one notification read
   */
  markNotificationRead: {
    request: { params: { id: string } };
    response: Notification;
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
  /**
   * Tell a person something
   */
  sendNotification: {
    request: {
      body: {
        /**
         * The person's `sub`.
         */
        to: string;
        title: string;
        body?: string;
        /**
         * Where choosing it goes. `https`, on the origin of one of the app's registered addresses.
         */
        url?: string;
        category?: NotificationCategory;
        /**
         * At most 90 days on. 30 days on when not given.
         */
        expiresAt?: string;
        key?: string;
      };
    };
    response: {
      id: string;
    };
  };
}

/** How each operation is called. `scopes` is undefined for a public one, and `safeToRepeat` says a failed call may be sent again. */
export const operations = {
  dismissAllNotifications: {
    method: 'POST',
    path: '/api/v1/notifications/dismiss-all',
    scopes: ['notifications'],
    safeToRepeat: false,
  },
  dismissNotification: {
    method: 'POST',
    path: '/api/v1/notifications/{id}/dismiss',
    scopes: ['notifications'],
    safeToRepeat: false,
  },
  findDirectoryUserByEmail: {
    method: 'GET',
    path: '/api/v1/directory/users/by-email',
    scopes: ['directory'],
    safeToRepeat: true,
  },
  getInstanceBranding: {
    method: 'GET',
    path: '/.well-known/sovereign-instance',
    scopes: undefined,
    safeToRepeat: true,
  },
  listNotifications: {
    method: 'GET',
    path: '/api/v1/notifications',
    scopes: ['notifications'],
    safeToRepeat: true,
  },
  markAllNotificationsRead: {
    method: 'POST',
    path: '/api/v1/notifications/read-all',
    scopes: ['notifications'],
    safeToRepeat: false,
  },
  markNotificationRead: {
    method: 'POST',
    path: '/api/v1/notifications/{id}/read',
    scopes: ['notifications'],
    safeToRepeat: false,
  },
  resolveDirectoryUsers: {
    method: 'POST',
    path: '/api/v1/directory/users/resolve',
    scopes: ['directory'],
    safeToRepeat: true,
  },
  searchDirectoryUsers: {
    method: 'GET',
    path: '/api/v1/directory/users',
    scopes: ['directory'],
    safeToRepeat: true,
  },
  sendNotification: {
    method: 'POST',
    path: '/api/v1/notifications',
    scopes: ['notifications:send'],
    safeToRepeat: false,
  },
} as const;
