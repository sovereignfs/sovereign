/**
 * Pure helpers for the `sv` CLI (see `bin/sv.ts`).
 *
 * Kept free of process orchestration so the branchy logic — plugin-id
 * resolution and the platform-plugin removal guard — is unit-testable in
 * isolation, mirroring the `scripts/install-plugins.ts` split.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCompatibility, validateManifest } from '@sovereignfs/manifest';

// ---------------------------------------------------------------------------
// Backup helpers
// ---------------------------------------------------------------------------

/** Parse the DATABASE_URL to decide the dialect. */
export function detectDialect(url: string): 'sqlite' | 'postgres' {
  return url.startsWith('postgres://') || url.startsWith('postgresql://') ? 'postgres' : 'sqlite';
}

/**
 * Build the default backup archive path:
 *   <cwd>/backups/sovereign-backup-<timestamp>-v<version>.tar.gz
 */
export function defaultArchivePath(workspaceRoot: string, version: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(workspaceRoot, 'backups', `sovereign-backup-${ts}-v${version}.tar.gz`);
}

/**
 * Directory names of the platform plugins that ship inside this monorepo. They
 * are committed (gitignore-allowlisted) and load-bearing — `sv plugin remove`
 * refuses to delete them. Matches the allowlist in the root `.gitignore`.
 */
export const PLATFORM_PLUGIN_DIRS = ['account', 'console', 'launcher'] as const;

/** Throw if `id` names a built-in platform plugin that must not be removed. */
export function assertRemovablePlugin(id: string): void {
  if ((PLATFORM_PLUGIN_DIRS as readonly string[]).includes(id)) {
    throw new Error(`"${id}" is a built-in platform plugin and cannot be removed.`);
  }
}

/** Read the platform version from the workspace root package.json. */
export function readPlatformVersion(workspaceRoot: string): string {
  try {
    const raw = readFileSync(join(workspaceRoot, 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Parse and validate a cloned plugin's `manifest.json` contents, check its
 * compatibility with the running platform, and return its declared `id` —
 * the directory name the plugin composes under. Throws on malformed JSON,
 * a manifest that fails validation, or a manifest that is incompatible with
 * the current platform version.
 */
export function resolvePluginIdFromManifest(
  rawManifestJson: string,
  workspaceRoot: string,
): string {
  let json: unknown;
  try {
    json = JSON.parse(rawManifestJson);
  } catch (error) {
    throw new Error(`manifest.json is not valid JSON: ${(error as Error).message}`);
  }
  const result = validateManifest(json);
  if (!result.valid) {
    throw new Error(`Invalid manifest.json:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  const platformVersion = readPlatformVersion(workspaceRoot);
  const compat = checkCompatibility(result.manifest, platformVersion);
  if (!compat.compatible) {
    throw new Error(
      `Cannot install plugin "${result.manifest.id}" — incompatible with this platform:\n  ${compat.reason}`,
    );
  }
  for (const w of compat.warnings) {
    console.warn(`Warning: ${w}`);
  }

  return result.manifest.id;
}
