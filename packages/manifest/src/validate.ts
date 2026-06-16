import { manifestSchema, registryEntrySchema } from './schema';
import type { RegistryEntry, SovereignManifest } from './types';

export type ValidationResult =
  | { valid: true; manifest: SovereignManifest }
  | { valid: false; errors: string[] };

/** Flatten a Zod error into human-readable `path: message` strings. */
function flattenIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Validate an unknown value against the manifest schema. On success returns the
 * parsed, typed manifest; on failure returns a flat list of human-readable
 * `path: message` errors. Invalid manifests fail the build (SRS PLT-07).
 */
export function validateManifest(input: unknown): ValidationResult {
  const result = manifestSchema.safeParse(input);
  if (result.success) {
    return { valid: true, manifest: result.data };
  }
  return { valid: false, errors: flattenIssues(result.error) };
}

export type RegistryValidationResult =
  | { valid: true; entry: RegistryEntry }
  | { valid: false; errors: string[] };

/**
 * Validate an unknown value against the registry-entry schema (a thin pointer
 * into the public plugin index — see `registryEntrySchema`). The plugin's full
 * manifest is validated separately, fetched from the entry's source at install
 * time.
 */
export function validateRegistryEntry(input: unknown): RegistryValidationResult {
  const result = registryEntrySchema.safeParse(input);
  if (result.success) {
    return { valid: true, entry: result.data };
  }
  return { valid: false, errors: flattenIssues(result.error) };
}
