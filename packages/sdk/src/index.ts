import * as auth from './auth';
import { activity } from './activity';
import { authz } from './authz';
import { connections } from './connections';
import { crypto } from './crypto';
import { data } from './data';
import { device } from './device';
import { directory } from './directory';
import * as db from './db';
import { e2ee } from './e2ee';
import { email } from './email';
import { env } from './env';
import { events } from './events';
import { handoffs } from './handoffs';
import { jobs } from './jobs';
import * as mailer from './mailer';
import { notifications } from './notifications';
import * as platform from './platform';
import { plugins } from './plugins';
import { portability } from './portability';
import { secrets } from './secrets';
import { storage } from './storage';
import { tools } from './tools';
import { billing } from './unimplemented';
import { webhooks } from './webhooks';

/**
 * The Sovereign SDK — the only contract between a plugin and the platform.
 *
 * **Stable surface (covered by the v1.0.0 semver guarantee** — see
 * `docs/sdk-stability.md`): `auth`, `db`, `mailer`, `platform`. These are
 * implemented and will not change in breaking ways without a major bump +
 * migration note (NFR-04).
 *
 * **Experimental / reserved (NOT covered by the stability guarantee):** `data`
 * (cross-plugin data sharing, RFC 0002), `activity` (activity log, RFC 0005),
 * `portability` (user data export/import, RFC 0007), `env` (plugin-scoped env
 * vars, RFC 0018), `notifications` (notification center, RFC 0015),
 * `directory` (member selection, RFC 0041), `secrets` (plugin secret vault,
 * RFC 0043), `storage` (plugin file storage, RFC 0044), `connections`
 * (external provider connections, RFC 0049), `e2ee` (client-side encryption
 * profile persistence, RFC 0060 — profile/device plumbing only; see
 * `e2ee-crypto`/`e2ee-device`/`e2ee-object`/`e2ee-state` for the browser-only
 * crypto and state helpers that produce the ciphertext these methods store),
 * `plugins` (dependency discovery and cross-plugin references, RFC 0051),
 * `email` (user-scoped `sendToUser` email surface, RFC 0062), `webhooks`
 * (public plugin webhook helpers — `verifyHmac`/`checkReplay`, RFC 0050),
 * `handoffs` (signed, short-lived cross-plugin flow handoffs —
 * authenticated or public/anonymous, RFC 0053), `jobs` (background jobs and
 * schedules, RFC 0046), `events` (ephemeral realtime channels, RFC 0045 —
 * `publish()` only; subscribing is a runtime route, not an SDK call, see
 * `docs/plugin-development.md`), `tools` (platform-mediated plugin tool
 * contracts — structured, permissioned, auditable cross-plugin actions with
 * a confirmation-token flow for mutating/external effects, RFC 0047),
 * `billing` (plugin monetization / entitlement gating, RFC 0003), `device`
 * (surface detection — `browser`/`mobile`/`desktop` — RFC 0080; a
 * presentation hint only, never a security boundary; capability probes and
 * invocation live in `@sovereignfs/sdk/device-client` and the future device
 * bridge, RFC 0083), `authz` (plugin-scoped roles and resource-scoped
 * grants — authorization below the platform role layer, never injected into
 * the session capability header, RFC 0054).
 * `data`, `activity`, `portability`, `env`, `notifications`, `directory`,
 * `secrets`, `crypto`, `storage`, `connections`, `e2ee`, `plugins`, `email`,
 * `webhooks`, `handoffs`, `jobs`, `events`, `tools`, `authz`, and `device`
 * are implemented; `billing` throws `NotImplementedError` until its backing
 * mechanism ships. Their shape may change before they stabilise.
 */
export const sdk = {
  // Stable (v1.0.0).
  auth,
  db,
  mailer,
  platform,
  // Experimental / reserved — shape may change; some throw until implemented.
  data,
  device,
  storage,
  directory,
  notifications,
  webhooks,
  handoffs,
  jobs,
  secrets,
  crypto,
  connections,
  e2ee,
  events,
  activity,
  portability,
  plugins,
  env,
  email,
  billing,
  tools,
  authz,
};

export { SENSITIVITY_CLASSES, FIELD_DATA_PREFIX, FIELD_PASSTHROUGH_PREFIX } from './types';
export {
  getFieldColumns,
  getTableFieldMetadata,
  type DiscoveredFieldColumn,
  type FieldColumnMeta,
  type FieldTableMetadata,
} from './field-schema';
export { provideHost } from './host';
export type { SdkHost } from './host';
export type { Surface } from './device';
/**
 * Client-side CMK/DEK crypto and state helpers (RFC 0060) — browser-only
 * (WebCrypto/IndexedDB). Deliberately NOT re-exported here: this barrel also
 * reaches server-only modules (e.g. `activity.ts`'s `next/headers` import),
 * and Next.js's client/server boundary check flags the whole module graph
 * reachable from an import — not just the specific named export used — so a
 * `'use client'` component importing anything from `@sovereignfs/sdk`
 * directly would fail to build. Import from the dedicated subpaths instead:
 *
 * ```ts
 * import { generateCmk, wrapCmkWithRecoverySecret } from '@sovereignfs/sdk/e2ee-crypto';
 * import { deriveDeviceOnlyKeyViaPrf } from '@sovereignfs/sdk/device-only-crypto';
 * import { getOrCreateDeviceId, storeDeviceKey } from '@sovereignfs/sdk/e2ee-device';
 * import { encryptBlob, encryptJson } from '@sovereignfs/sdk/e2ee-object';
 * import { getE2eeLocalState } from '@sovereignfs/sdk/e2ee-state';
 * import { offline } from '@sovereignfs/sdk/offline';
 * import { offlineQueue, drainQueue } from '@sovereignfs/sdk/offline-queue';
 * ```
 *
 * Types are erased at compile time (no runtime module graph), so they stay
 * exported from the main barrel below for convenience.
 */
export type { RecoveryWrappedCmk, WrappedCmk, WrappedDek } from './e2ee-crypto';
export type { EncryptedBlob, EncryptedJson } from './e2ee-object';
export type { E2eeLocalState } from './e2ee-state';
export {
  NotImplementedError,
  NotAuthenticatedError,
  ConsentRequiredError,
  EntitlementRequiredError,
  EventPayloadTooLargeError,
  GrantRequiredError,
} from './errors';
export type { PluginGrant, GrantScope, GrantCheck, GrantResolver } from './authz';
export type { DataContractRef, DataContractResolver } from './data';
export type {
  ExportContext,
  ExportOptions,
  ImportContext,
  PluginExportSection,
  ExportSecretMetadata,
  ExportResolver,
  ImportHandler,
  DeletionContext,
  DeletionResult,
  DeletionHandler,
} from './portability';
export type {
  PluginAvailability,
  PluginContractSummary,
  PluginListFilter,
  ConsentStatus,
  PluginReference,
} from './plugins';
export type {
  Session,
  SessionUser,
  ActiveSession,
  ChangePasswordInput,
  DirectoryUser,
  EmailDeliveryStatus,
  EmailSendResult,
  MailOptions,
  PlatformConfig,
  ProviderConfig,
  ProviderConfigSource,
  ResolveUsersInput,
  SearchUsersInput,
  ActivityLogEntry,
  DrizzleClient,
  NotificationItem,
  NotificationListOptions,
  NotificationListResult,
  SendNotificationInput,
  SendToUserEmailInput,
  VerifyWebhookHmacInput,
  CheckWebhookReplayInput,
  EventEnvelope,
  PublishEventInput,
  EventChannelAuthorizerContext,
  EventChannelAuthorizer,
  ConnectionContext,
  ConnectionListFilter,
  ConnectionOAuthState,
  ConnectionRef,
  ConnectionScope,
  ConnectionStatus,
  CreateConnectionInput,
  MarkConnectionErrorInput,
  OAuthStateInput,
  SanitizedConnectionError,
  CreateSecretInput,
  ScheduleContext,
  ScheduleHandler,
  JobStatus,
  JobRef,
  EnqueueJobInput,
  ScheduleJobInput,
  JobContext,
  JobHandler,
  SecretContext,
  SecretRef,
  SecretScope,
  SensitivityClass,
  EncryptFieldOptions,
  DecryptFieldOptions,
  HashFieldOptions,
  CryptoContext,
  StorageContext,
  StorageObject,
  StoragePutInput,
  E2eeProfile,
  E2eeProfileStatus,
  E2eeRecoveryWrapper,
  E2eeDeviceEnrollment,
  E2eeState,
  E2eeContext,
  CreateE2eeProfileInput,
  SetE2eeRecoveryWrapperInput,
  EnrollE2eeDeviceInput,
  UpdateSecretInput,
  UpdateConnectionInput,
  HandoffMode,
  CreateHandoffInput,
  HandoffToken,
  ConsumeHandoffOptions,
  HandoffContext,
  HandoffRequestContext,
  ToolContext,
  ToolEffect,
  ToolExecuteOptions,
  ToolPreviewResponse,
  ToolPreviewResult,
  ToolProviderHandlers,
  ToolRef,
} from './types';
