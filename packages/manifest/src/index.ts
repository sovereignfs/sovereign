export {
  manifestSchema,
  permissionSchema,
  manifestFieldNames,
  registryEntrySchema,
  registryEntryFieldNames,
  CURRENT_MANIFEST_SCHEMA_VERSION,
} from './schema';
export {
  validateManifest,
  type ValidationResult,
  validateRegistryEntry,
  type RegistryValidationResult,
} from './validate';
export { findApiProvider, type ApiProviderResult } from './api-provider';
export { checkCompatibility, type CompatibilityResult } from './compatibility';
export type { SovereignManifest, Permission, RegistryEntry } from './types';
