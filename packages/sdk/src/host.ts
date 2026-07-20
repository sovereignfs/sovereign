import type { DataContractRef, DataContractResolver } from './data';
import type { DeletionHandler, ExportResolver, ImportHandler } from './portability';
import type { ConsentStatus, PluginAvailability, PluginListFilter } from './plugins';
import type {
  ActivityLogEntry,
  DirectoryUser,
  DrizzleClient,
  EmailSendResult,
  MailOptions,
  PlatformConfig,
  ProviderConfig,
  ResolveUsersInput,
  SearchUsersInput,
  SendNotificationInput,
  SendToUserEmailInput,
  CreateSecretInput,
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
  SecretContext,
  SecretRef,
  SecretScope,
  SetE2eeRecoveryWrapperInput,
  StorageContext,
  StorageObject,
  StoragePutInput,
  UpdateConnectionInput,
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
    /** Register a resolver for a contract this plugin provides. */
    provide(contract: string, resolver: DataContractResolver): void;
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
