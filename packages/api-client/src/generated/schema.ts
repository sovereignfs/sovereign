// Generated from spec/core-api/openapi.yaml by scripts/generate-api-client.ts. Do not edit it: change the contract and run `pnpm generate:api-client`.

/**
 * How it looks. It changes nothing else.
 */
export type NotificationCategory = 'info' | 'success' | 'warning' | 'error';

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  category: NotificationCategory;
  createdAt: string;
  readAt: string | null;
  expiresAt: string;
};

export type NotificationCount = {
  count: number;
};

export type ErrorResponse = {
  /**
   * What kind of failure, for a program to act on.
   */
  error: 'invalid_request' | 'invalid_token' | 'insufficient_scope' | 'not_found' | 'rate_limited';
  /**
   * What happened, for a person to read.
   */
  message: string;
};

export type DirectoryUser = {
  /**
   * The person's stable identifier, the same `sub` an ID token carries. Never reused.
   */
  sub: string;
  name: string;
  /**
   * The address of their picture, or null when they have none.
   */
  picture: string | null;
};

export type DirectoryUserStatus = {
  sub: string;
  name: string;
  picture: string | null;
  /**
   * False for a deactivated account, which cannot sign in.
   */
  active: boolean;
};

export type InstanceBranding = {
  /**
   * The instance's name.
   */
  name: string;
  /**
   * The instance's own address, which is also its issuer.
   */
  url: string;
  logo: {
    /**
     * A logo for a light page. When only one logo is set it is given for both.
     */
    light: string | null;
    /**
     * A logo for a dark page.
     */
    dark: string | null;
  };
  favicon: string | null;
  /**
   * What this core serves, so an app can tell a capability it lacks from a failure. A core that does not
   * publish this field serves the Directory and the instance document, and nothing else.
   */
  api: {
    /**
     * The API versions served, such as `v1`.
     */
    versions: string[];
    /**
     * The groups of calls served, such as `directory`. A capability is listed when every call of it is
     * served.
     */
    capabilities: ('directory' | 'notifications' | 'email' | 'activity')[];
  };
};
