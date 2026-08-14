export {
  manifestSchema,
  manifestDatabaseIsolation,
  permissionSchema,
  surfaceSchema,
  manifestFieldNames,
  registryEntrySchema,
  registryEntryFieldNames,
  CURRENT_MANIFEST_SCHEMA_VERSION,
  type ManifestDatabaseIsolation,
} from './schema';
export {
  validateManifest,
  type ValidationResult,
  validateRegistryEntry,
  type RegistryValidationResult,
} from './validate';
export { findApiProvider, type ApiProviderResult } from './api-provider';
export { checkCompatibility, type CompatibilityResult } from './compatibility';
export { toEnvSlug, toEnvVarName } from './env-utils';
export { pluginCapabilityName } from './cap-utils';
export { pluginToolName, effectiveRequiresConfirmation } from './tool-utils';
export type {
  SovereignManifest,
  Permission,
  RegistryEntry,
  Surface,
  HandoffReceiverDeclaration,
  ToolDeclaration,
} from './types';
