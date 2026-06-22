import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_TENANT_ID,
  findWorkspaceRoot,
  getConsentGrant,
  getDefaultTenant,
  getPlatformSetting,
  getPluginDb,
  getInstanceConfig,
  logDataAccess,
  provisionPluginDb,
  recordActivity,
  sendNotification,
} from '@sovereignfs/db';
import { getPlatformDb } from './db';
import { createMailer } from '@sovereignfs/mailer';
import { ConsentRequiredError, provideHost } from '@sovereignfs/sdk';
import { registry } from '../generated/registry';
import type {
  ActivityLogEntry,
  DataContractRef,
  DataContractResolver,
  ExportResolver,
  ImportHandler,
  SendNotificationInput,
} from '@sovereignfs/sdk';
import { registerExporter, registerImporter } from './portability/registry';
import { fanOutPushToUser } from './push';

let _version: string | undefined;

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

provideHost({
  db: {
    async getClient(pluginId: string | null) {
      if (pluginId) {
        const manifest = registry.find((m) => m.id === pluginId);
        if (manifest?.database === 'isolated') {
          // Provision on first use (idempotent), then return the dedicated client.
          await provisionPluginDb(pluginId);
          return getPluginDb(pluginId).db;
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
      const [tenant, inviteOnly, instanceCfg] = await Promise.all([
        getDefaultTenant(db),
        getPlatformSetting(db, 'invite_only'),
        getInstanceConfig(db, DEFAULT_TENANT_ID),
      ]);
      return {
        tenantName: tenant.name,
        inviteOnly: inviteOnly === 'true',
        version: getPlatformVersion(),
        instanceName: instanceCfg.instanceName,
        instancePrimaryColor: instanceCfg.instancePrimary ?? undefined,
      };
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
  },
  notifications: {
    async send(input: SendNotificationInput, pluginId: string): Promise<void> {
      const pdb = await getPlatformDb();
      await sendNotification(pdb, {
        id: randomUUID(),
        recipientUserId: input.recipientUserId,
        source: pluginId,
        sourceType: 'plugin',
        title: input.title,
        body: input.body,
        url: input.url,
        category: input.category,
        icon: input.icon,
      });
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
});
