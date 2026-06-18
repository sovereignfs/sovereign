export { createClient, findWorkspaceRoot, resolveSqlitePath, type DbConfig } from './client';
export { platformBootstrapStatements } from './bootstrap';
export {
  DEFAULT_ROOT_PLUGIN_ID,
  DEFAULT_TENANT_ID,
  bootstrapPlatformDb,
  createConsentGrant,
  getAccountPrefs,
  getConsentGrant,
  getDefaultTenant,
  getPlatformDb,
  getPlatformSetting,
  listAllConsentGrants,
  listConsentGrants,
  listDisabledPluginIds,
  listPluginStatus,
  logDataAccess,
  pingDb,
  revokeConsentGrant,
  setAccountPrefs,
  setPlatformSetting,
  setPluginEnabled,
  setTenantName,
  type AccountPrefsValue,
  type ConsentGrantRow,
  type PlatformDb,
} from './platform-db';
export { resolveDialect, type Dialect, type ResolvedDialect } from './dialect';
export { runMigrations } from './migrate';

export * as schema from './schema/sqlite';
export type {
  Tenant,
  NewTenant,
  User,
  NewUser,
  Session,
  NewSession,
  PluginStatus,
  NewPluginStatus,
  PlatformSetting,
  NewPlatformSetting,
  AccountPrefs,
  NewAccountPrefs,
  ConsentGrant,
  NewConsentGrant,
  DataAccessLogEntry,
  NewDataAccessLogEntry,
} from './schema/sqlite/platform';
