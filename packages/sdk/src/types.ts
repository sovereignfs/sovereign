export interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  /** Effective capability strings derived from the role preset (RFC 0021). */
  capabilities: readonly string[];
}

export interface Session {
  user: SessionUser;
  /** Session expiry as a Unix timestamp (seconds). */
  expiresAt: number;
}

/** An authenticated session for the current user (SRS ACC-05). */
export interface ActiveSession {
  /** Opaque session token — pass to `sdk.auth.revokeSession` to end it. */
  token: string;
  /** Whether this is the session making the current request. */
  current: boolean;
  /** Raw User-Agent string of the device that created the session, if known. */
  userAgent: string | null;
  ipAddress: string | null;
  /** Creation, last-active, and expiry as ISO 8601 strings. */
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface PlatformConfig {
  tenantName: string;
  inviteOnly: boolean;
  version: string;
  /** Instance name; falls back to tenantName when no instance name is configured. */
  instanceName: string;
  /** Validated 6-digit hex colour overriding --sv-color-accent, or undefined when unset. */
  instancePrimaryColor?: string;
  /** Display name used in email From headers. Falls back to instanceName when unset. */
  emailFromName?: string;
  /** Absolute URL to the logo image used in email headers. Must be publicly reachable. */
  emailLogo?: string;
  /** Public base URL of the runtime instance (used in email footers and links). */
  instanceUrl: string;
}

/**
 * An activity event a plugin records via `sdk.activity.log()` (RFC 0005 —
 * reserved surface, not yet implemented). The plugin supplies only the event
 * shape; the runtime injects the actor, tenant, and emitting plugin and forces
 * the event to be user-scoped, so a plugin cannot forge actor identity.
 */
export interface ActivityLogEntry {
  /** Dotted action verb, e.g. `"list.created"`. Namespaced by the runtime per plugin. */
  action: string;
  /** The user this event is about, if any — drives the user's personal-feed visibility. */
  subjectUserId?: string;
  /** Generic target kind, e.g. `"list"`. */
  targetType?: string;
  /** Generic target id, e.g. the list id. */
  targetId?: string;
  /** Human-readable one-line summary. */
  summary?: string;
  /** Structured detail (before/after, etc.). Avoid PII beyond what is necessary. */
  metadata?: Record<string, unknown>;
}

/**
 * The Drizzle client returned by `sdk.db.getClient()` — the live platform
 * Drizzle instance. Kept opaque (`unknown`) at the contract level so the
 * published SDK takes no dependency on a specific dialect's Drizzle types;
 * plugins type their own queries through their schema.
 */
export type DrizzleClient = unknown;

/**
 * Input to `sdk.notifications.send()` (RFC 0015).
 * The runtime auto-populates `source`, `sourceType`, and `tenantId` from
 * request context — plugins never set those.
 */
export interface SendNotificationInput {
  /** User ID of the intended recipient. */
  recipientUserId: string;
  /** Short notification headline. */
  title: string;
  /** Optional longer body text. */
  body?: string;
  /** In-app route to navigate to when the notification is clicked. */
  url?: string;
  /**
   * Category tag — drives mute preferences.
   * Built-in categories: `'info'` (default), `'announcement'`, `'security'`.
   * Custom plugin categories are allowed; `'security'` cannot be muted.
   */
  category?: string;
  /** Optional `<Icon>` name from `@sovereignfs/ui` to show on the notification. */
  icon?: string;
}
