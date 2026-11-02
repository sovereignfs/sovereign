import manifest1 from '../../../contracts/schemas/app-manifest-v1.schema.json' with { type: 'json' };
import manifest2 from '../../../contracts/schemas/app-manifest-v2.schema.json' with { type: 'json' };

/** Every manifest version's JSON Schema, as published under `contracts/schemas`, by the `manifest` number. */
export const schemas = { 1: manifest1, 2: manifest2 } as const;

/** The manifest versions this package reads: all that have ever been supported, since old images stay published. */
export const supportedVersions = [1, 2] as const;

export type ManifestVersion = (typeof supportedVersions)[number];

/** The version a document says it is, when it says one this package reads. */
export function versionOf(document: unknown): ManifestVersion | undefined {
  const version = (document as { manifest?: unknown } | null)?.manifest;
  return (supportedVersions as readonly unknown[]).includes(version)
    ? (version as ManifestVersion)
    : undefined;
}
