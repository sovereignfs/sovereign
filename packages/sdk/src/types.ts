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

/** Display-safe user shape returned by `sdk.directory` (RFC 0041). */
export interface DirectoryUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface SearchUsersInput {
  query: string;
  limit?: number;
}

export interface ResolveUsersInput {
  ids: string[];
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export type EmailDeliveryStatus = 'skipped' | 'sent' | 'failed';

/** Result of `sdk.email.sendToUser()` (RFC 0062). */
export interface EmailSendResult {
  status: EmailDeliveryStatus;
  errorCode?: string;
}

/**
 * Input to `sdk.email.sendToUser()` (RFC 0062) — the safer, user-scoped
 * alternative to `sdk.mailer.send()`. The platform resolves `recipientUserId`
 * to an email address server-side; plugins never see or supply a raw
 * recipient address through this API.
 */
export interface SendToUserEmailInput {
  recipientUserId: string;
  /** Caller-defined identifier recorded for audit/diagnostics. Not yet used for template rendering (RFC 0031). */
  templateId: string;
  subject: string;
  html?: string;
  text?: string;
  /** Structured data recorded alongside the delivery-log entry. */
  data?: Record<string, string | number | boolean | null>;
}

export interface PlatformConfig {
  /**
   * Name of the default tenant row — set in Console › Settings › Instance name.
   * In v1 (single-tenant) this is the platform-wide workspace name.
   * Multi-tenant deployments (post-v1) will surface per-tenant names separately.
   */
  tenantName: string;
  inviteOnly: boolean;
  version: string;
  /** Instance name; falls back to tenantName when no white-label name is configured. */
  instanceName: string;
  /** Validated 6-digit hex colour overriding --sv-color-accent, or undefined when unset. */
  instancePrimaryColor?: string;
  /**
   * Stable UUID that uniquely identifies this Sovereign installation.
   * Generated once at bootstrap and never changes. Use this to identify the
   * instance in federated contexts, license checks, or analytics.
   */
  instanceId: string;
  /** Display name for outbound email's "From" header; falls back to instanceName when unset. */
  emailFromName?: string;
  /** Absolute URL to the logo image used in email headers, or undefined when unset. */
  emailLogo?: string;
  /**
   * Public base URL of this Sovereign instance (from `NEXT_PUBLIC_RUNTIME_URL`,
   * falling back to `http://localhost:<RUNTIME_PORT ?? 3000>`). Use this to
   * build absolute links (e.g. in outbound email) instead of hardcoding a URL.
   */
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
  /**
   * Optional URL to an image shown in the OS push notification (the Push
   * API's `icon` option — not an `@sovereignfs/ui` `<Icon>` name; nothing
   * in-app reads this field today). Defaults to the sending plugin's own
   * `/plugin-icons/<pluginId>.svg` when unset — only set this to override
   * with a notification-specific image instead of the plugin's own icon.
   */
  icon?: string;
}

/**
 * `sdk.webhooks.verifyHmac()` input (RFC 0050). `body` is the raw request
 * bytes exactly as received — read them with a bounded-size reader before
 * any JSON parsing, since parsing first would defeat the point of verifying
 * the signature against the exact bytes the provider signed.
 * `signatureHeader` is the digest **value** your provider sent (hex-encoded,
 * with any provider-specific prefix like GitHub's `sha256=` already
 * stripped by your own code) — this helper does not parse provider-specific
 * header formats, only compares a raw hex digest.
 */
export interface VerifyWebhookHmacInput {
  body: Uint8Array;
  signatureHeader: string;
  /** A `SecretRef.id` for a `'plugin'`-scoped secret created via `sdk.secrets.create()`. */
  secretRef: string;
  algorithm: 'sha256' | 'sha512';
}

/**
 * `sdk.webhooks.checkReplay()` input (RFC 0050). `provider`/`eventId`
 * together are the dedupe key, scoped to the calling plugin — two plugins
 * (or two providers on the same plugin) never collide on the same `eventId`.
 */
export interface CheckWebhookReplayInput {
  provider: string;
  eventId: string;
  /** Defaults to 24h. How long a claim blocks reprocessing of the same event. */
  ttlSeconds?: number;
}

/** Plugin-scoped file storage object metadata (RFC 0044). */
export interface StorageObject {
  id: string;
  pluginId: string;
  ownerUserId: string | null;
  key: string;
  contentType: string;
  size: number;
  checksum: string;
  /** The `metadata` passed to `put()`, round-tripped back on `get()`/`list()`. */
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoragePutInput {
  key: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType: string;
  /** Owner of the object. Omit for a plugin-scoped (not per-user) object. */
  ownerUserId?: string;
  metadata?: Record<string, unknown> | null;
}

export interface StorageContext {
  tenantId: string;
  pluginId: string;
  userId: string | null;
}

/**
 * Client-side encryption profile shapes (RFC 0060, epic task 8.9). Persisted
 * via `sdk.e2ee`; the browser-only crypto that produces/consumes the
 * ciphertext these methods store lives in `e2ee-crypto`/`e2ee-device`/
 * `e2ee-object`/`e2ee-state`. Distinct from server-side field crypto
 * (`sdk.crypto.encryptField()`, RFC 0092): the runtime can decrypt a
 * server-side field; it can never decrypt a client-side encrypted object.
 *
 * The Client Master Key (CMK) itself never exists server-side, plaintext or
 * otherwise — only wrapped copies (`E2eeRecoveryWrapper`/
 * `E2eeDeviceEnrollment`) and non-sensitive KDF/algorithm metadata do.
 */
export type E2eeProfileStatus = 'active' | 'disabled';

/** Whether the current user has set up client-side encryption at all. */
export interface E2eeProfile {
  id: string;
  userId: string;
  status: E2eeProfileStatus;
  /** e.g. `'AES-GCM-256'` — the algorithm used to encrypt objects under the CMK. */
  cmkAlgorithm: string;
  createdAt: number;
  updatedAt: number;
}

/** The CMK wrapped by a key derived from the user's recovery secret. One per user. */
export interface E2eeRecoveryWrapper {
  id: string;
  userId: string;
  wrappedCmk: string;
  kdfAlgorithm: string;
  /** Opaque JSON-encoded KDF parameters (iterations, memory cost, etc.). */
  kdfParams: string;
  kdfSalt: string;
  algorithmVersion: string;
  createdAt: number;
  updatedAt: number;
}

/** The CMK wrapped by one enrolled device's own key. Many per user. */
export interface E2eeDeviceEnrollment {
  id: string;
  userId: string;
  deviceId: string;
  deviceLabel: string | null;
  wrappedCmk: string;
  algorithmVersion: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** `null` while the device is still enrolled. */
  revokedAt: number | null;
}

/**
 * Normalized state a plugin checks before touching client-side encrypted
 * data — the SDK never hides the recovery model (RFC 0060 "SDK
 * responsibilities"). `unsupported` means the browser lacks required
 * WebCrypto primitives.
 */
export type E2eeState = 'not-set-up' | 'locked' | 'unlocked' | 'unsupported';

/** No plugin scoping — one profile per user, regardless of caller. */
export interface E2eeContext {
  tenantId: string;
  userId: string;
}

export interface CreateE2eeProfileInput {
  cmkAlgorithm: string;
}

export interface SetE2eeRecoveryWrapperInput {
  wrappedCmk: string;
  kdfAlgorithm: string;
  kdfParams: string;
  kdfSalt: string;
  algorithmVersion: string;
}

export interface EnrollE2eeDeviceInput {
  deviceId: string;
  deviceLabel: string | null;
  wrappedCmk: string;
  algorithmVersion: string;
}

/** Runtime-created secret scope for the experimental plugin vault (RFC 0043). */
export type SecretScope = 'user' | 'plugin' | 'instance';

/** Metadata returned for a stored secret. Plaintext values are never included. */
export interface SecretRef {
  id: string;
  scope: SecretScope;
  label: string;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface CreateSecretInput {
  scope: SecretScope;
  label: string;
  value: string;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateSecretInput {
  id: string;
  value: string;
}

export interface SecretContext {
  tenantId: string;
  pluginId: string;
  userId: string | null;
  capabilities: readonly string[];
}

/**
 * Sensitivity taxonomy for server-side field encryption (RFC 0092). A plugin
 * author *classifies* a field; whether that class is actually encrypted is
 * the operator's instance-wide policy decision (`SOVEREIGN_ENCRYPT_CLASSES`).
 * Closed set — extending it is a platform change (minor SDK bump), reviewed
 * like any other public-contract change.
 */
export const SENSITIVITY_CLASSES = ['pii', 'health', 'financial', 'sensitive'] as const;
export type SensitivityClass = (typeof SENSITIVITY_CLASSES)[number];

/**
 * Field-envelope prefixes (RFC 0092). `svf1` = ciphertext under the
 * (class × plugin) DEK; `svf0` = base64url-encoded passthrough written while
 * the class was not enabled by operator policy. Single source of truth —
 * the runtime host implementation and the schema-helper tripwire both
 * consume these.
 */
export const FIELD_DATA_PREFIX = 'svf1';
export const FIELD_PASSTHROUGH_PREFIX = 'svf0';

/** Options for `sdk.crypto.encryptField()` (RFC 0092). */
export interface EncryptFieldOptions {
  /** The field's sensitivity classification — see `SENSITIVITY_CLASSES`. */
  sensitivity: SensitivityClass;
  /**
   * Optional binding scope (e.g. a column name). The same value must be
   * presented at decryption time; a mismatch fails authentication. Default `''`.
   */
  context?: string;
}

/** Options for `sdk.crypto.decryptField()` (RFC 0092). */
export interface DecryptFieldOptions {
  /** Must match the `context` used at encryption time. Default `''`. */
  context?: string;
}

/** Options for `sdk.crypto.hashField()` — the blind-index primitive (RFC 0092). */
export interface HashFieldOptions {
  /** The sensitivity class of the source column — selects the HMAC key. */
  sensitivity: SensitivityClass;
}

/**
 * Runtime-injected request context for `sdk.crypto` calls (RFC 0092).
 * `pluginId` is `null` outside a plugin route context — the host falls back
 * to the portability plugin context (export/import resolvers run outside
 * request routes) and rejects the call if no plugin identity resolves.
 */
export interface CryptoContext {
  tenantId: string;
  pluginId: string | null;
}

/** Runtime-created external provider connection scope (RFC 0049). */
export type ConnectionScope = 'user' | 'plugin' | 'instance';

/** Metadata status for a plugin-owned external provider connection. */
export type ConnectionStatus = 'connected' | 'needs_reauth' | 'paused' | 'disconnected' | 'error';

/** Metadata returned for an external connection. Secret values are never included. */
export interface ConnectionRef {
  id: string;
  scope: ConnectionScope;
  provider: string;
  label: string;
  status: ConnectionStatus;
  secretRef: string | null;
  metadata: Record<string, unknown> | null;
  lastCheckedAt: number | null;
  lastUsedAt: number | null;
  lastError: SanitizedConnectionError | null;
  createdAt: number;
  updatedAt: number;
  disconnectedAt: number | null;
}

export interface CreateConnectionInput {
  scope: ConnectionScope;
  provider: string;
  label: string;
  secretRef?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConnectionListFilter {
  provider?: string;
  scope?: ConnectionScope;
  includeDisconnected?: boolean;
}

export interface UpdateConnectionInput {
  label?: string;
  status?: ConnectionStatus;
  metadata?: Record<string, unknown> | null;
  secretRef?: string | null;
  lastCheckedAt?: number | null;
}

export interface SanitizedConnectionError {
  code?: string;
  message: string;
  retryable?: boolean;
  status?: number;
}

export interface MarkConnectionErrorInput {
  error: SanitizedConnectionError;
  status?: Extract<ConnectionStatus, 'error' | 'needs_reauth'>;
}

export interface OAuthStateInput {
  provider: string;
  callbackPath: string;
  nonce?: string;
  metadata?: Record<string, unknown> | null;
  expiresInSeconds?: number;
}

export interface ConnectionOAuthState {
  pluginId: string;
  provider: string;
  userId: string;
  callbackPath: string;
  nonce: string;
  metadata: Record<string, unknown> | null;
  expiresAt: number;
}

/** Source summary for effective external provider configuration (Task 3.27). */
export type ProviderConfigSource = 'env' | 'console' | 'mixed' | 'missing';

/** Server-side effective external provider config for the calling plugin. */
export interface ProviderConfig {
  provider: string;
  label: string;
  configured: boolean;
  source: ProviderConfigSource;
  publicValues: Record<string, string>;
  secretValues: Record<string, string>;
  callbackUrl: string | null;
  scopes: readonly string[];
  missingRequired: readonly string[];
}

export interface ConnectionContext {
  tenantId: string;
  pluginId: string;
  userId: string | null;
  capabilities: readonly string[];
}

/**
 * Context passed to a plugin's schedule handler (RFC 0046, Phase 1 subset).
 * There is no originating HTTP request — the platform's in-process scheduler
 * invokes handlers directly — so the runtime supplies synthetic `headers`
 * pre-stamped with the calling plugin's identity. Pass them to SDK methods
 * that attribute by request headers (e.g.
 * `sdk.notifications.send(input, ctx.headers)`).
 */
export interface ScheduleContext {
  /** The invoking plugin's manifest id (e.g. `fs.sovereign.tasks`). */
  pluginId: string;
  /** The schedule's manifest-declared id (e.g. `due-reminders`). */
  scheduleId: string;
  /** Synthetic headers carrying `x-sovereign-plugin-id` for SDK attribution. */
  headers: Headers;
}

/**
 * A plugin's schedule handler — the **default export** of a manifest-declared
 * `schedules[].entry` module. Invoked server-side every `intervalMinutes`
 * while the plugin is installed and enabled.
 *
 * Handlers must be idempotent: the interval is a floor, not an exact cadence,
 * and restarts or multiple replicas can invoke a handler again sooner than
 * the interval — claim work with conditional updates before acting on it.
 * Thrown errors are caught and logged by the platform; there are no retries
 * in Phase 1.
 */
export type ScheduleHandler = (ctx: ScheduleContext) => Promise<void>;

// ---------------------------------------------------------------------------
// Plugin flow handoffs (RFC 0053)
// ---------------------------------------------------------------------------

/** Whether a handoff requires an authenticated Sovereign session to consume, or allows an anonymous visitor. */
export type HandoffMode = 'authenticated' | 'public';

export interface CreateHandoffInput<TPayload = unknown> {
  /** The receiving plugin's manifest `id`. */
  providerId: string;
  /** The handoff name, matching one of the provider's declared `handoffs.receives[]` entries. */
  name: string;
  payload: TPayload;
  /**
   * Where the provider should send the visitor back afterward. Validated
   * with the same same-origin-relative-path check `/login`'s own
   * `returnUrl` uses — an absolute or scheme-relative URL is rejected
   * (open-redirect prevention, RFC 0053 security requirement).
   */
  returnUrl?: string;
  mode: HandoffMode;
  /** Defaults to `true` — the token (and the handoff row) can only ever be consumed once. */
  singleUse?: boolean;
  /** Defaults to 15 minutes, capped at 1 hour. */
  expiresInSeconds?: number;
}

export interface HandoffToken {
  token: string;
  expiresAt: number;
}

export interface ConsumeHandoffOptions {
  /** The handoff name this provider expects — must match what the token was created for. */
  name: string;
}

/** What a provider receives back from a successfully consumed handoff. */
export interface HandoffContext<TPayload = unknown> {
  sourcePluginId: string;
  providerId: string;
  name: string;
  tenantId: string;
  /** The user who created the handoff, when `mode: 'authenticated'`; `null` for `mode: 'public'`. */
  actorUserId: string | null;
  mode: HandoffMode;
  payload: TPayload;
  returnUrl: string | null;
  createdAt: number;
  expiresAt: number;
}

/** Runtime-injected context for a handoff create/consume call — derived from verified request headers. */
export interface HandoffRequestContext {
  tenantId: string;
  /** The plugin making the call — the *source* on create, the *provider* on consume. */
  pluginId: string;
  actorUserId: string | null;
}
