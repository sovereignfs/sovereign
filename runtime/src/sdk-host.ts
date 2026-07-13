import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_TENANT_ID,
  createE2eeDeviceEnrollment,
  createE2eeProfile,
  type E2eeProfileRow,
  createPluginSecret,
  createPluginConnection,
  createStorageObject,
  deletePluginSecret,
  deleteStorageObject,
  disconnectPluginConnection,
  findWorkspaceRoot,
  getConsentGrant,
  getDefaultTenant,
  getE2eeProfile,
  getE2eeRecoveryWrapper,
  getInstanceId,
  getPlatformSetting,
  getPluginSecret,
  getPluginConnection,
  getPluginDb,
  getInstanceConfig,
  getStorageObjectByKey,
  listE2eeDeviceEnrollments,
  listPluginConnections,
  listPluginSecrets,
  listStorageObjects,
  logDataAccess,
  markPluginConnectionError,
  markPluginConnectionUsed,
  markPluginSecretUsed,
  provisionPluginDb,
  recordActivity,
  revokeE2eeDeviceEnrollment,
  sendNotification,
  sumPluginStorageBytes,
  updatePluginConnection,
  updatePluginSecret,
  upsertE2eeRecoveryWrapper,
} from '@sovereignfs/db';
import { getPlatformDb } from './db';
import { createMailer } from '@sovereignfs/mailer';
import { manifestDatabaseDialect, manifestDatabaseIsolation } from '@sovereignfs/manifest';
import { ConsentRequiredError, provideHost } from '@sovereignfs/sdk';
import { registry } from '../generated/registry';
import type {
  ActivityLogEntry,
  ConnectionContext,
  ConnectionRef,
  DataContractRef,
  DataContractResolver,
  DirectoryUser,
  DeletionHandler,
  E2eeProfile,
  ExportResolver,
  ImportHandler,
  ResolveUsersInput,
  SearchUsersInput,
  SecretContext,
  SecretRef,
  SecretScope,
  SendNotificationInput,
  ProviderConfig,
  StorageObject,
} from '@sovereignfs/sdk';
import { registerDeleter, registerExporter, registerImporter } from './portability/registry';
import { fanOutPushToUser } from './push';
import { getBroker } from './notification-broker';
import {
  checkDirectoryRateLimit,
  normalizeResolveUsersInput,
  normalizeSearchUsersInput,
  toDirectoryUsers,
} from './directory';
import {
  createOAuthStateToken,
  errorToJson,
  metadataToJson as connectionMetadataToJson,
  normalizeConnectionLabel,
  normalizeProvider,
  requireInstanceConnectionCapability,
  toConnectionRef,
  verifyOAuthStateToken,
} from './connections';
import {
  decryptSecretValue,
  encryptSecretValue,
  metadataToJson,
  normalizeSecretLabel,
  toSecretRef,
} from './secrets';
import {
  checksumOf,
  createStorageToken,
  deleteObjectBytes,
  maxObjectBytes,
  maxPluginBytes,
  readObjectBytes,
  storageMetadataToJson,
  StorageQuotaExceededError,
  toBuffer,
  toStorageObject,
  writeObjectBytes,
} from './storage';
import { resolveProviderConfig } from './provider-configs';

let _version: string | undefined;
const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

/**
 * The platform version from the workspace root package.json (tracks roadmap
 * milestones). Read once per process; '0.0.0' when the root manifest is
 * unreadable (standalone / Docker contexts where findWorkspaceRoot falls back
 * to cwd and package.json may not be at the root).
 */
function getPlatformVersion(): string {
  if (_version) return _version;
  try {
    const raw = readFileSync(join(findWorkspaceRoot(), 'package.json'), 'utf8');
    _version = (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    _version = '0.0.0';
  }
  return _version;
}

const _mailer = createMailer();

/**
 * In-process registry for cross-plugin data resolvers (RFC 0002).
 * Keyed by contract name. Populated by provider plugins calling
 * `sdk.data.provide('contract', resolver)`. Resets on server restart.
 */
const _resolverRegistry = new Map<string, DataContractResolver>();

function toE2eeProfile(row: E2eeProfileRow): E2eeProfile {
  return {
    ...row,
    status: row.status === 'disabled' ? 'disabled' : 'active',
  };
}

function requireInstanceSecretCapability(scope: SecretScope, context: SecretContext): void {
  if (scope === 'instance' && !context.capabilities.includes('instance:configure')) {
    throw new Error('sdk.secrets instance scope requires the instance:configure capability.');
  }
}

async function auditSecretOperation(
  action: string,
  context: SecretContext,
  ref: { id: string; scope: SecretScope; label: string },
): Promise<void> {
  const pdb = await getPlatformDb();
  await recordActivity(pdb, {
    id: randomUUID(),
    actorId: context.userId,
    actorType: context.userId ? 'user' : 'plugin',
    action,
    subjectUserId: ref.scope === 'user' ? context.userId : null,
    targetType: 'plugin_secret',
    targetId: ref.id,
    pluginId: context.pluginId,
    visibility: ref.scope === 'user' ? 'user' : 'admin',
    summary: `Plugin secret ${action.split('.').at(-1) ?? 'changed'}: ${ref.label}`,
    metadata: { scope: ref.scope },
  });
}

async function auditConnectionOperation(
  action: string,
  context: ConnectionContext,
  ref: { id: string; scope: string; label: string; provider: string },
): Promise<void> {
  const pdb = await getPlatformDb();
  await recordActivity(pdb, {
    id: randomUUID(),
    actorId: context.userId,
    actorType: context.userId ? 'user' : 'plugin',
    action,
    subjectUserId: ref.scope === 'user' ? context.userId : null,
    targetType: 'plugin_connection',
    targetId: ref.id,
    pluginId: context.pluginId,
    visibility: ref.scope === 'user' ? 'user' : 'admin',
    summary: `External connection ${action.split('.').at(-1) ?? 'changed'}: ${ref.label}`,
    metadata: { scope: ref.scope, provider: ref.provider },
  });
}

async function fetchDirectoryUsers(body: Record<string, unknown>): Promise<DirectoryUser[]> {
  const res = await fetch(`${AUTH_URL}/api/admin/directory`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Directory lookup failed (${String(res.status)}).`);
  }
  return toDirectoryUsers((await res.json().catch(() => [])) as unknown[]);
}

provideHost({
  db: {
    async getClient(pluginId: string | null) {
      if (pluginId) {
        const manifest = registry.find((m) => m.id === pluginId);
        if (manifest && manifestDatabaseIsolation(manifest.database) === 'isolated') {
          const pluginDialect = manifestDatabaseDialect(manifest.database);
          // Provision on first use (idempotent), then return the dedicated client.
          await provisionPluginDb(pluginId, pluginDialect);
          return getPluginDb(pluginId, pluginDialect).db;
        }
      }
      return (await getPlatformDb()).db;
    },
  },
  mailer: {
    async send(options) {
      return _mailer.send(options);
    },
  },
  platform: {
    async getConfig() {
      const db = await getPlatformDb();
      const [tenant, inviteOnly, instanceCfg, instanceId] = await Promise.all([
        getDefaultTenant(db),
        getPlatformSetting(db, 'invite_only'),
        getInstanceConfig(db, DEFAULT_TENANT_ID),
        getInstanceId(db),
      ]);
      return {
        tenantName: tenant.name,
        inviteOnly: inviteOnly === 'true',
        version: getPlatformVersion(),
        instanceName: instanceCfg.instanceName,
        instancePrimaryColor: instanceCfg.instancePrimary ?? undefined,
        instanceId,
      };
    },
  },
  directory: {
    async searchUsers(
      input: SearchUsersInput,
      requestingUserId: string,
      tenantId: string,
    ): Promise<DirectoryUser[]> {
      const limited = checkDirectoryRateLimit(`${tenantId}:${requestingUserId}:sdk`);
      if (!limited.allowed) {
        throw new Error(
          `Directory rate limit exceeded. Retry after ${String(limited.retryAfterSeconds ?? 60)} seconds.`,
        );
      }
      const normalized = normalizeSearchUsersInput(input);
      return fetchDirectoryUsers({ mode: 'search', ...normalized });
    },
    async resolveUsers(
      input: ResolveUsersInput,
      requestingUserId: string,
      tenantId: string,
    ): Promise<DirectoryUser[]> {
      const limited = checkDirectoryRateLimit(`${tenantId}:${requestingUserId}:sdk`);
      if (!limited.allowed) {
        throw new Error(
          `Directory rate limit exceeded. Retry after ${String(limited.retryAfterSeconds ?? 60)} seconds.`,
        );
      }
      const normalized = normalizeResolveUsersInput(input);
      if (normalized.ids.length === 0) return [];
      return fetchDirectoryUsers({ mode: 'resolve', ...normalized });
    },
  },
  data: {
    provide(contract: string, resolver: DataContractResolver): void {
      _resolverRegistry.set(contract, resolver);
    },
    async query(
      ref: DataContractRef,
      consumerId: string | null,
      userId: string | null,
      _tenantId: string,
      params: unknown,
    ): Promise<unknown[]> {
      if (!userId) throw new ConsentRequiredError();
      if (!consumerId) {
        throw new Error(
          'sdk.data.query() requires a plugin route context (x-sovereign-plugin-id header missing).',
        );
      }

      const pdb = await getPlatformDb();
      const grant = await getConsentGrant(
        pdb,
        userId,
        consumerId,
        ref.providerId,
        ref.contract,
        ref.version,
      );
      if (!grant) throw new ConsentRequiredError();

      const resolver = _resolverRegistry.get(ref.contract);
      if (!resolver) {
        throw new Error(
          `sdk.data.query(): no resolver registered for contract "${ref.contract}". ` +
            `The provider plugin (${ref.providerId}) must call sdk.data.provide() before consumers can query it.`,
        );
      }

      const rows = await resolver(params);

      await logDataAccess(
        pdb,
        randomUUID(),
        userId,
        consumerId,
        ref.providerId,
        ref.contract,
        ref.version,
        rows.length,
      );

      return rows;
    },
  },
  activity: {
    async log(entry: ActivityLogEntry, actorId: string | null, pluginId: string | null) {
      const pdb = await getPlatformDb();
      await recordActivity(pdb, {
        id: randomUUID(),
        actorId: actorId ?? null,
        actorType: pluginId ? 'plugin' : 'user',
        action: pluginId ? `${pluginId}:${entry.action}` : entry.action,
        subjectUserId: entry.subjectUserId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        pluginId: pluginId ?? null,
        visibility: 'user',
        summary: entry.summary ?? null,
        metadata: entry.metadata ?? null,
      });
    },
  },
  portability: {
    provideExport(pluginId: string, resolver: ExportResolver): void {
      registerExporter(pluginId, resolver);
    },
    provideImport(pluginId: string, handler: ImportHandler): void {
      registerImporter(pluginId, handler);
    },
    provideDelete(pluginId: string, handler: DeletionHandler): void {
      registerDeleter(pluginId, handler);
    },
  },
  notifications: {
    async send(input: SendNotificationInput, pluginId: string): Promise<void> {
      const pdb = await getPlatformDb();
      const notifId = randomUUID();
      await sendNotification(pdb, {
        id: notifId,
        recipientUserId: input.recipientUserId,
        source: pluginId,
        sourceType: 'plugin',
        title: input.title,
        body: input.body,
        url: input.url,
        category: input.category,
        icon: input.icon,
      });

      // Broker publish for SSE/Redis transport (no-op in polling mode).
      const broker = getBroker();
      if (broker) {
        void broker.publish(input.recipientUserId, {
          notificationId: notifId,
          userId: input.recipientUserId,
          title: input.title,
          body: input.body ?? undefined,
          url: input.url ?? undefined,
          category: input.category ?? 'info',
          source: pluginId,
        });
      }

      // Fire-and-forget push fan-out (respects per-user muted-category prefs).
      void fanOutPushToUser(input.recipientUserId, {
        title: input.title,
        body: input.body,
        url: input.url,
        category: input.category,
        icon: input.icon,
      });
    },
  },
  storage: {
    async put(input, context): Promise<StorageObject> {
      const bytes = await toBuffer(input.body);
      if (bytes.length > maxObjectBytes()) {
        throw new StorageQuotaExceededError(
          `Object exceeds the maximum size of ${String(maxObjectBytes())} bytes.`,
        );
      }
      const pdb = await getPlatformDb();
      const currentTotal = await sumPluginStorageBytes(pdb, context.tenantId, context.pluginId);
      if (currentTotal + bytes.length > maxPluginBytes()) {
        throw new StorageQuotaExceededError(
          `Plugin storage quota of ${String(maxPluginBytes())} bytes would be exceeded.`,
        );
      }

      const id = randomUUID();
      writeObjectBytes(context.pluginId, id, bytes);
      try {
        const row = await createStorageObject(pdb, {
          id,
          tenantId: context.tenantId,
          pluginId: context.pluginId,
          ownerUserId: input.ownerUserId ?? null,
          key: input.key,
          contentType: input.contentType,
          size: bytes.length,
          checksum: checksumOf(bytes),
          metadata: storageMetadataToJson(input.metadata),
        });
        return toStorageObject(row);
      } catch (err) {
        // Metadata row failed — don't leave an orphaned physical object behind.
        deleteObjectBytes(context.pluginId, id);
        throw err;
      }
    },

    async get(key, context): Promise<(StorageObject & { body: ReadableStream }) | null> {
      const pdb = await getPlatformDb();
      const row = await getStorageObjectByKey(pdb, key, context);
      if (!row) return null;
      const bytes = readObjectBytes(context.pluginId, row.id);
      if (!bytes) return null;
      return { ...toStorageObject(row), body: new Blob([new Uint8Array(bytes)]).stream() };
    },

    async delete(key, context): Promise<void> {
      const pdb = await getPlatformDb();
      const row = await getStorageObjectByKey(pdb, key, context);
      if (!row) return;
      const deleted = await deleteStorageObject(pdb, row.id, context);
      if (deleted) deleteObjectBytes(context.pluginId, deleted.id);
    },

    async list(prefix, context): Promise<StorageObject[]> {
      const pdb = await getPlatformDb();
      const rows = await listStorageObjects(pdb, context, prefix);
      return rows.map(toStorageObject);
    },

    async getSignedUrl(key, options, context): Promise<string> {
      const pdb = await getPlatformDb();
      const row = await getStorageObjectByKey(pdb, key, context);
      if (!row) throw new Error(`Storage object not found for key "${key}".`);
      const token = createStorageToken({
        tenantId: context.tenantId,
        pluginId: context.pluginId,
        objectId: row.id,
        expiresInSeconds: options?.expiresInSeconds,
      });
      return `/api/storage/${token}`;
    },
  },
  e2ee: {
    async getProfile(context) {
      const pdb = await getPlatformDb();
      const row = await getE2eeProfile(pdb, context.tenantId, context.userId);
      return row ? toE2eeProfile(row) : null;
    },

    async createProfile(input, context) {
      const pdb = await getPlatformDb();
      const row = await createE2eeProfile(pdb, {
        id: randomUUID(),
        tenantId: context.tenantId,
        userId: context.userId,
        cmkAlgorithm: input.cmkAlgorithm,
      });
      return toE2eeProfile(row);
    },

    async getRecoveryWrapper(context) {
      const pdb = await getPlatformDb();
      const row = await getE2eeRecoveryWrapper(pdb, context.tenantId, context.userId);
      return row ?? null;
    },

    async setRecoveryWrapper(input, context) {
      const pdb = await getPlatformDb();
      return upsertE2eeRecoveryWrapper(pdb, {
        id: randomUUID(),
        tenantId: context.tenantId,
        userId: context.userId,
        ...input,
      });
    },

    async enrollDevice(input, context) {
      const pdb = await getPlatformDb();
      return createE2eeDeviceEnrollment(pdb, {
        id: randomUUID(),
        tenantId: context.tenantId,
        userId: context.userId,
        ...input,
      });
    },

    async listDevices(context) {
      const pdb = await getPlatformDb();
      return listE2eeDeviceEnrollments(pdb, context.tenantId, context.userId);
    },

    async revokeDevice(id, context) {
      const pdb = await getPlatformDb();
      await revokeE2eeDeviceEnrollment(pdb, id, context.tenantId, context.userId);
    },
  },
  secrets: {
    async create(input, context): Promise<SecretRef> {
      requireInstanceSecretCapability(input.scope, context);
      const label = normalizeSecretLabel(input.label);
      const scopedUserId = input.scope === 'user' ? context.userId : null;
      const ciphertext = encryptSecretValue(input.value, {
        tenantId: context.tenantId,
        pluginId: context.pluginId,
        scope: input.scope,
        userId: scopedUserId,
      });
      const row = await createPluginSecret(await getPlatformDb(), {
        id: randomUUID(),
        tenantId: context.tenantId,
        pluginId: context.pluginId,
        userId: context.userId,
        scope: input.scope,
        label,
        ciphertext,
        metadata: metadataToJson(input.metadata),
      });
      const ref = toSecretRef(row);
      await auditSecretOperation('plugin.secret.created', context, ref);
      return ref;
    },

    async get(id, context): Promise<string | null> {
      const pdb = await getPlatformDb();
      const row = await getPluginSecret(pdb, id, context);
      if (!row) return null;
      requireInstanceSecretCapability(row.scope, context);
      const value = decryptSecretValue(row.ciphertext, {
        tenantId: row.tenantId,
        pluginId: row.pluginId,
        scope: row.scope,
        userId: row.userId,
      });
      await markPluginSecretUsed(pdb, id, context);
      await auditSecretOperation('plugin.secret.read', context, row);
      return value;
    },

    async list(scope, context): Promise<SecretRef[]> {
      if (scope) requireInstanceSecretCapability(scope, context);
      const rows = await listPluginSecrets(await getPlatformDb(), context, scope);
      return rows
        .filter(
          (row) => row.scope !== 'instance' || context.capabilities.includes('instance:configure'),
        )
        .map(toSecretRef);
    },

    async update(id, value, context): Promise<SecretRef> {
      const pdb = await getPlatformDb();
      const row = await getPluginSecret(pdb, id, context);
      if (!row) throw new Error('Plugin secret not found.');
      requireInstanceSecretCapability(row.scope, context);
      const ciphertext = encryptSecretValue(value, {
        tenantId: row.tenantId,
        pluginId: row.pluginId,
        scope: row.scope,
        userId: row.userId,
      });
      const updated = await updatePluginSecret(pdb, id, context, ciphertext);
      if (!updated) throw new Error('Plugin secret not found.');
      const ref = toSecretRef(updated);
      await auditSecretOperation('plugin.secret.updated', context, ref);
      return ref;
    },

    async delete(id, context): Promise<void> {
      const pdb = await getPlatformDb();
      const row = await getPluginSecret(pdb, id, context);
      if (!row) return;
      requireInstanceSecretCapability(row.scope, context);
      await deletePluginSecret(pdb, id, context);
      await auditSecretOperation('plugin.secret.deleted', context, row);
    },
  },
  connections: {
    async create(input, context): Promise<ConnectionRef> {
      requireInstanceConnectionCapability(input.scope, context.capabilities);
      const row = await createPluginConnection(await getPlatformDb(), {
        id: randomUUID(),
        tenantId: context.tenantId,
        pluginId: context.pluginId,
        userId: context.userId,
        scope: input.scope,
        provider: normalizeProvider(input.provider),
        label: normalizeConnectionLabel(input.label),
        secretRef: input.secretRef ?? null,
        metadata: connectionMetadataToJson(input.metadata),
      });
      const ref = toConnectionRef(row);
      await auditConnectionOperation('plugin.connection.created', context, row);
      return ref;
    },

    async list(filter, context): Promise<ConnectionRef[]> {
      if (filter?.scope) {
        requireInstanceConnectionCapability(filter.scope, context.capabilities);
      }
      const rows = await listPluginConnections(await getPlatformDb(), context, {
        ...filter,
        provider: filter?.provider ? normalizeProvider(filter.provider) : undefined,
      });
      return rows
        .filter(
          (row) => row.scope !== 'instance' || context.capabilities.includes('instance:configure'),
        )
        .map(toConnectionRef);
    },

    async get(id, context): Promise<ConnectionRef | null> {
      const row = await getPluginConnection(await getPlatformDb(), id, context);
      if (!row) return null;
      requireInstanceConnectionCapability(row.scope, context.capabilities);
      return toConnectionRef(row);
    },

    async update(id, input, context): Promise<ConnectionRef> {
      const pdb = await getPlatformDb();
      const existing = await getPluginConnection(pdb, id, context);
      if (!existing) throw new Error('Plugin connection not found.');
      requireInstanceConnectionCapability(existing.scope, context.capabilities);
      const updated = await updatePluginConnection(pdb, id, context, {
        label: input.label ? normalizeConnectionLabel(input.label) : undefined,
        status: input.status,
        metadata:
          input.metadata === undefined ? undefined : connectionMetadataToJson(input.metadata),
        secretRef: input.secretRef,
        lastCheckedAt: input.lastCheckedAt,
      });
      if (!updated) throw new Error('Plugin connection not found.');
      await auditConnectionOperation('plugin.connection.updated', context, updated);
      return toConnectionRef(updated);
    },

    async disconnect(id, context): Promise<void> {
      const pdb = await getPlatformDb();
      const existing = await getPluginConnection(pdb, id, context);
      if (!existing) return;
      requireInstanceConnectionCapability(existing.scope, context.capabilities);
      await disconnectPluginConnection(pdb, id, context);
      await auditConnectionOperation('plugin.connection.disconnected', context, existing);
    },

    async markUsed(id, context): Promise<void> {
      await markPluginConnectionUsed(await getPlatformDb(), id, context);
    },

    async markError(id, input, context): Promise<ConnectionRef> {
      const row = await markPluginConnectionError(
        await getPlatformDb(),
        id,
        context,
        errorToJson(input.error),
        input.status ?? 'error',
      );
      if (!row) throw new Error('Plugin connection not found.');
      await auditConnectionOperation('plugin.connection.error', context, row);
      return toConnectionRef(row);
    },

    async createOAuthState(input, context): Promise<string> {
      if (!context.userId) throw new Error('OAuth state creation requires an authenticated user.');
      return createOAuthStateToken({
        pluginId: context.pluginId,
        userId: context.userId,
        provider: input.provider,
        callbackPath: input.callbackPath,
        nonce: input.nonce,
        metadata: input.metadata,
        expiresInSeconds: input.expiresInSeconds,
      });
    },

    async verifyOAuthState(state, context) {
      return verifyOAuthStateToken(state, {
        pluginId: context.pluginId,
        userId: context.userId,
      });
    },

    async getProviderConfig(provider, context): Promise<ProviderConfig> {
      const manifest = registry.find((candidate) => candidate.id === context.pluginId);
      if (!manifest) throw new Error('Calling plugin is not installed.');
      const providerId = normalizeProvider(provider);
      const declaration = manifest.connections?.providers.find(
        (candidate) => candidate.id === providerId,
      );
      if (!declaration) throw new Error('Provider is not declared by the calling plugin manifest.');
      const effective = await resolveProviderConfig({
        tenantId: context.tenantId,
        manifest,
        provider: declaration,
        includeSecrets: true,
      });
      const {
        id: _id,
        status: _status,
        lastCheckedAt: _lastCheckedAt,
        lastError: _lastError,
        ...sdkConfig
      } = effective;
      return sdkConfig;
    },
  },
});
