// Generated from contracts/core-api/openapi.yaml by scripts/generate-api-client.ts. Do not edit it: change the contract and run `pnpm generate:api-client`.

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

export type PersonKeys = {
  sub: string;
  receivingKey: PublicKey;
  signingKey: PublicKey;
  /**
   * The account's Ed25519 signature, base64url, over `sovereign/1/app-keys`, the `sub`, the app's client id and the two public
   * keys (RFC 0005 §1.2). A browser refuses keys whose signature does not verify with `accountSigningKey`.
   */
  signature: string;
  accountSigningKey: PublicKey;
};

/**
 * The caller's `PersonKeys`, and their private halves.
 */
export type MyKeys = {
  sub: string;
  receivingKey: PublicKey;
  signingKey: PublicKey;
  signature: string;
  accountSigningKey: PublicKey;
  /**
   * The private halves, each wrapped by the app key, which no server holds.
   */
  wrapped: {
    receive: WrapRecord;
    sign: WrapRecord;
  };
};

/**
 * A 32-byte X25519 or Ed25519 public key, base64url.
 */
export type PublicKey = string;

/**
 * A secret encrypted with AES-256-GCM under a key the browser holds (RFC 0005 §1.2).
 */
export type WrapRecord = {
  suite: number;
  nonce: string;
  ciphertext: string;
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
   * 32 random bytes, base64url, made once by the instance and never changed. A browser makes a person's sign-in value
   * from it, the address and the password, so that the password never reaches core. A core older than this field does
   * not publish it.
   */
  instanceId?: string;
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
    capabilities: ('directory' | 'notifications' | 'email' | 'activity' | 'keys')[];
  };
};
