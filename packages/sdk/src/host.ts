import type { GrantCheck, GrantResolver } from './authz';
import type { DataContractRef, DataContractResolver } from './data';
import type { FieldTableMetadata } from './field-schema';
import type { DeletionHandler, ExportResolver, ImportHandler } from './portability';
import type { ConsentStatus, PluginAvailability, PluginListFilter } from './plugins';
import type {
  ActivityLogEntry,
  DirectoryUser,
  DrizzleClient,
  EmailSendResult,
  MailOptions,
  NotificationListOptions,
  NotificationListResult,
  PlatformConfig,
  ProviderConfig,
  ResolveUsersInput,
  SearchUsersInput,
  SendNotificationInput,
  SendToUserEmailInput,
  CheckWebhookReplayInput,
  VerifyWebhookHmacInput,
  CreateSecretInput,
  CryptoContext,
  DecryptFieldOptions,
  EncryptFieldOptions,
  EnqueueJobInput,
  HashFieldOptions,
  JobRef,
  ScheduleJobInput,
  ConnectionContext,
  ConnectionListFilter,
  ConnectionOAuthState,
  ConnectionRef,
  CreateConnectionInput,
  CreateE2eeProfileInput,
  E2eeContext,
  E2eeDeviceEnrollment,
  E2eeProfile,
  E2eeRecoveryWrapper,
  EnrollE2eeDeviceInput,
  MarkConnectionErrorInput,
  OAuthStateInput,
  PublishEventInput,
  SecretContext,
  SecretRef,
  SecretScope,
  SetE2eeRecoveryWrapperInput,
  StorageContext,
  StorageObject,
  StoragePutInput,
  ToolContext,
  ToolExecuteOptions,
  ToolPreviewResponse,
  ToolProviderHandlers,
  ToolRef,
  UpdateConnectionInput,
  ConsumeHandoffOptions,
  CreateHandoffInput,
  HandoffContext,
  HandoffRequestContext,
  HandoffToken,
} from './types';

/**
 * The host interface that the Sovereign runtime provides to the SDK.
 * Every method that touches platform infrastructure (DB, mailer, config) is
 * routed through this interface — the SDK itself has no runtime dependencies.
 */
export interface SdkHost {
  db: {
    /**
     * `pluginId` is the calling plugin's manifest id, read from the
     * `x-sovereign-plugin-id` request header by the SDK. `null` means the call
     * happened outside a plugin route context; the platform DB is returned.
     */
    getClient(pluginId: string | null): Promise<DrizzleClient>;
  };
  env: {
    /**
     * Resolve `SV_PLUGIN_<SLUG>_<KEY>` for the calling plugin (RFC 0018).
     * `pluginId` is the calling plugin's manifest id, read from the
     * `x-sovereign-plugin-id` request header by the SDK; `null` means the
     * call happened outside a plugin route context (e.g. a background
     * job/schedule handler) — the host falls back to its own
     * background-invocation context, the same way `db.getClient` and
     * `storage.*` do. Returns `null` when the variable is absent or no
     * plugin id is resolvable from either source.
     */
    get(key: string, pluginId: string | null): Promise<string | null>;
  };
  mailer: {
    /**
     * Low-level, direct-recipient email send (RFC 0062). `pluginId` is
     * resolved by the SDK from an explicitly passed request `Headers` object
     * — `null` means the call happened outside a plugin route context and
     * must be rejected. Requires the `mailer:send` manifest permission, plus
     * `mailer:sendExternal` since the recipient is a raw address rather than
     * a platform-resolved user.
     */
    send(options: MailOptions, pluginId: string | null): Promise<void>;
  };
  email: {
    /**
     * User-scoped email send (RFC 0062) — the safer alternative to
     * `mailer.send`. `pluginId` is resolved the same way as `mailer.send`.
     * Requires the `mailer:send` manifest permission; the recipient's email
     * address is resolved server-side from `recipientUserId`.
     */
    sendToUser(input: SendToUserEmailInput, pluginId: string | null): Promise<EmailSendResult>;
  };
  platform: {
    getConfig(): Promise<PlatformConfig>;
  };
  directory: {
    /**
     * Search active users in the current tenant. `requestingUserId` and
     * `tenantId` come from runtime-injected request context, not plugin input.
     */
    searchUsers(
      input: SearchUsersInput,
      requestingUserId: string,
      tenantId: string,
    ): Promise<DirectoryUser[]>;
    /**
     * Resolve explicit user IDs to display-safe profile fields for active users
     * in the current tenant.
     */
    resolveUsers(
      input: ResolveUsersInput,
      requestingUserId: string,
      tenantId: string,
    ): Promise<DirectoryUser[]>;
  };
  data: {
    /**
     * Register a resolver for a contract this plugin provides. `providerId`
     * is threaded through from the caller's own plugin id (read from request
     * headers by the SDK caller) so the host can namespace the registration
     * and never collide with another plugin's same-named local contract.
     */
    provide(providerId: string, contract: string, resolver: DataContractResolver): void;
    /**
     * Query a provider plugin's contract for the current user.
     * `consumerId` and `userId` are read from request headers by the SDK caller.
     */
    query(
      ref: DataContractRef,
      consumerId: string | null,
      userId: string | null,
      tenantId: string,
      params: unknown,
    ): Promise<unknown[]>;
  };
  activity: {
    /**
     * Record one activity event.
     * `actorId`, `pluginId`, and `tenantId` are injected by the runtime host
     * from request headers so plugins cannot forge actor identity.
     */
    log(entry: ActivityLogEntry, actorId: string | null, pluginId: string | null): Promise<void>;
  };
  portability: {
    /**
     * Register a plugin's export resolver, keyed by `pluginId` (resolved by the
     * SDK from the request context). The runtime invokes it at export time.
     */
    provideExport(pluginId: string, resolver: ExportResolver): void;
    /** Register a plugin's import handler, keyed by `pluginId`. */
    provideImport(pluginId: string, handler: ImportHandler): void;
    /** Register a plugin's deletion handler (RFC 0033), keyed by `pluginId`. */
    provideDelete(pluginId: string, handler: DeletionHandler): void;
  };
  authz: {
    /** Register a plugin's grant resolver (RFC 0054), keyed by `pluginId`. */
    provide(pluginId: string, resolver: GrantResolver): void;
    /**
     * Check `check` for `userId` against the resolver registered for
     * `pluginId`. `false` when no resolver is registered — fails closed.
     */
    hasGrant(pluginId: string, userId: string, check: GrantCheck): Promise<boolean>;
  };
  plugins: {
    /** Discover one installed plugin's status (RFC 0051), scoped to the given user. */
    get(
      id: string,
      userId: string | null,
      capabilities: readonly string[],
    ): Promise<PluginAvailability | null>;
    /** Discover installed plugins, optionally filtered, scoped to the given user. */
    list(
      filter: PluginListFilter | undefined,
      userId: string | null,
      capabilities: readonly string[],
    ): Promise<PluginAvailability[]>;
    /** Whether `userId` has an active consent grant for `ref`, requested by `consumerId`. */
    getConsentStatus(
      ref: DataContractRef,
      consumerId: string,
      userId: string,
    ): Promise<ConsentStatus>;
  };
  notifications: {
    /**
     * Deliver one notification to a user. The runtime injects `source`,
     * `sourceType`, and `tenantId` from the request context so the plugin only
     * supplies the payload fields.
     */
    send(input: SendNotificationInput, pluginId: string): Promise<void>;
    /**
     * Read the CALLING USER's own Notification Center inbox — the same real,
     * cross-plugin list the platform's own bell shows, never scoped to the
     * calling plugin. `userId` is always the current session's own id,
     * resolved by the SDK client from request context, never plugin input —
     * a plugin can only ever read its own signed-in user's notifications.
     */
    list(
      userId: string,
      options: NotificationListOptions,
      pluginId: string,
    ): Promise<NotificationListResult>;
    /** Mark one of the calling user's own notifications read. No-op if not theirs or already read. */
    markRead(id: string, userId: string, pluginId: string): Promise<void>;
    /** Mark all of the calling user's own unread notifications read. */
    markAllRead(userId: string, pluginId: string): Promise<void>;
    /** Dismiss one of the calling user's own notifications. No-op if not theirs. */
    dismiss(id: string, userId: string, pluginId: string): Promise<void>;
    /** Dismiss all of the calling user's own non-dismissed notifications. */
    dismissAll(userId: string, pluginId: string): Promise<void>;
  };
  webhooks: {
    /** Verify an HMAC signature against a plugin-scoped secret (RFC 0050). */
    verifyHmac(input: VerifyWebhookHmacInput, pluginId: string): Promise<boolean>;
    /** Claim `(provider, eventId)` for replay protection, scoped to `pluginId`. */
    checkReplay(input: CheckWebhookReplayInput, pluginId: string): Promise<boolean>;
  };
  handoffs: {
    /** Source: create a signed handoff token for a provider-declared receiver. */
    create(input: CreateHandoffInput, context: HandoffRequestContext): Promise<HandoffToken>;
    /** Provider: consume a handoff token, returning its stored payload and context. */
    consume(
      token: string,
      options: ConsumeHandoffOptions,
      context: HandoffRequestContext,
    ): Promise<HandoffContext>;
  };
  jobs: {
    /** `pluginId`/`userId` are resolved by the SDK from request headers (real or synthetic). */
    enqueue(input: EnqueueJobInput, pluginId: string, userId: string | null): Promise<JobRef>;
    schedule(input: ScheduleJobInput, pluginId: string, userId: string | null): Promise<JobRef>;
    /** Scoped to `pluginId` — cannot cancel another plugin's job. */
    cancel(id: string, pluginId: string): Promise<boolean>;
    /** Scoped to `pluginId` — cannot read another plugin's job. */
    get(id: string, pluginId: string): Promise<JobRef | null>;
  };
  events: {
    /**
     * Publish one event to a plugin-scoped channel (RFC 0045). `pluginId`
     * is resolved by the SDK from an explicitly passed request `Headers`
     * object, same as `notifications.send` — `'unknown'` means the call
     * happened outside a plugin route context.
     */
    publish(input: PublishEventInput, pluginId: string): Promise<void>;
  };
  storage: {
    put(input: StoragePutInput, context: StorageContext): Promise<StorageObject>;
    get(
      key: string,
      context: StorageContext,
    ): Promise<(StorageObject & { body: ReadableStream }) | null>;
    delete(key: string, context: StorageContext): Promise<void>;
    list(prefix: string | undefined, context: StorageContext): Promise<StorageObject[]>;
    getSignedUrl(
      key: string,
      options: { expiresInSeconds?: number } | undefined,
      context: StorageContext,
    ): Promise<string>;
  };
  /**
   * Client-side encryption profile persistence (RFC 0060). Pure metadata
   * plumbing — no encryption happens here; the CMK is generated and
   * wrapped/unwrapped entirely in the browser (`@sovereignfs/sdk`'s
   * `e2ee-crypto`/`e2ee-device` modules) before these methods are ever
   * called with the resulting ciphertext.
   */
  e2ee: {
    getProfile(context: E2eeContext): Promise<E2eeProfile | null>;
    createProfile(input: CreateE2eeProfileInput, context: E2eeContext): Promise<E2eeProfile>;
    getRecoveryWrapper(context: E2eeContext): Promise<E2eeRecoveryWrapper | null>;
    setRecoveryWrapper(
      input: SetE2eeRecoveryWrapperInput,
      context: E2eeContext,
    ): Promise<E2eeRecoveryWrapper>;
    enrollDevice(input: EnrollE2eeDeviceInput, context: E2eeContext): Promise<E2eeDeviceEnrollment>;
    listDevices(context: E2eeContext): Promise<E2eeDeviceEnrollment[]>;
    revokeDevice(id: string, context: E2eeContext): Promise<void>;
  };
  secrets: {
    create(input: CreateSecretInput, context: SecretContext): Promise<SecretRef>;
    get(id: string, context: SecretContext): Promise<string | null>;
    list(scope: SecretScope | undefined, context: SecretContext): Promise<SecretRef[]>;
    update(id: string, value: string, context: SecretContext): Promise<SecretRef>;
    delete(id: string, context: SecretContext): Promise<void>;
  };
  crypto: {
    /**
     * Server-side field encryption (RFC 0092). Requires the `crypto:use`
     * manifest permission, enforced host-side against the calling plugin's
     * manifest. Returns `svf1:` ciphertext when the operator policy enables
     * the class, `svf0:` passthrough otherwise; `decryptField` accepts both
     * and never consults the policy (data written under an enabled class
     * stays readable after the class is disabled).
     */
    encryptField(
      value: string,
      options: EncryptFieldOptions,
      context: CryptoContext,
    ): Promise<string>;
    decryptField(
      envelope: string,
      options: DecryptFieldOptions,
      context: CryptoContext,
    ): Promise<string>;
    /** Blind-index keyed hash (RFC 0092 leg 3). Unkeyed fallback when no KEK is configured. */
    hashField(value: string, options: HashFieldOptions, context: CryptoContext): Promise<string>;
    /**
     * Blind-index hash candidates (RFC 0092 gate B): `[current]` normally,
     * `[current, previous]` while a rotation window is open — the dual-read
     * primitive `blindIndexMatch()` builds conditions from.
     */
    hashFieldCandidates(
      value: string,
      options: HashFieldOptions,
      context: CryptoContext,
    ): Promise<string[]>;
    /** Persist classified-table registrations for the CLI re-seal walker (RFC 0092 gate B). */
    registerTables(metadata: FieldTableMetadata[], context: CryptoContext): Promise<void>;
  };
  connections: {
    create(input: CreateConnectionInput, context: ConnectionContext): Promise<ConnectionRef>;
    list(
      filter: ConnectionListFilter | undefined,
      context: ConnectionContext,
    ): Promise<ConnectionRef[]>;
    get(id: string, context: ConnectionContext): Promise<ConnectionRef | null>;
    update(
      id: string,
      input: UpdateConnectionInput,
      context: ConnectionContext,
    ): Promise<ConnectionRef>;
    disconnect(id: string, context: ConnectionContext): Promise<void>;
    markUsed(id: string, context: ConnectionContext): Promise<void>;
    markError(
      id: string,
      input: MarkConnectionErrorInput,
      context: ConnectionContext,
    ): Promise<ConnectionRef>;
    createOAuthState(input: OAuthStateInput, context: ConnectionContext): Promise<string>;
    verifyOAuthState(state: string, context: ConnectionContext): Promise<ConnectionOAuthState>;
    getProviderConfig(provider: string, context: ConnectionContext): Promise<ProviderConfig>;
  };
  tools: {
    /** Register a provider plugin's preview/execute handlers for one of its declared tools. */
    provide(providerId: string, name: string, handlers: ToolProviderHandlers): void;
    /**
     * Preview a tool call — must not mutate. Returns a confirmation token
     * when the tool's effective `requiresConfirmation` is `true`.
     */
    preview(ref: ToolRef, input: unknown, context: ToolContext): Promise<ToolPreviewResponse>;
    /**
     * Execute a tool call. `context.confirmationToken` is required and
     * verified against the exact `input` when the tool requires confirmation.
     */
    execute(
      ref: ToolRef,
      input: unknown,
      context: ToolContext & ToolExecuteOptions,
    ): Promise<unknown>;
  };
}

/**
 * The host is stored on `globalThis` under a `Symbol.for` key, NOT a plain
 * module-level variable. Next.js compiles instrumentation, route handlers, and
 * server actions into separate bundles, each of which can get its own instance
 * of this module — and dev HMR re-evaluates it on edits, resetting any
 * module-level state. With a per-module `let`, `provideHost()` (called once from
 * `runtime/instrumentation.ts`) would set the host on one instance while a
 * plugin server action reads `null` from another, throwing "no runtime host".
 * A `Symbol.for`-keyed global is shared across every module instance in the same
 * Node process, so the single registration is always visible.
 */
const HOST_KEY = Symbol.for('@sovereignfs/sdk:host');

interface HostHolder {
  [HOST_KEY]?: SdkHost | null;
}

function holder(): HostHolder {
  return globalThis as unknown as HostHolder;
}

/**
 * Register the platform host implementation. Called once at runtime startup
 * (via `runtime/instrumentation.ts`) before any request is served.
 *
 * Exported from `@sovereignfs/sdk` so the runtime can call it; plugin code
 * should never need to call this.
 */
export function provideHost(host: SdkHost): void {
  holder()[HOST_KEY] = host;
}

/**
 * Return the registered host implementation, throwing if none is registered
 * (i.e. the SDK is being executed outside the Sovereign runtime).
 */
export function requireHost(): SdkHost {
  const host = holder()[HOST_KEY];
  if (!host) {
    throw new Error(
      '@sovereignfs/sdk: no runtime host is registered. ' +
        'SDK methods run inside the Sovereign runtime — start the platform with `pnpm dev` ' +
        'or `pnpm sv dev` and ensure the plugin is installed.',
    );
  }
  return host;
}
