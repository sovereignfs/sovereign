import type { SovereignManifest } from './types';

/** The single API provider resolved from a set of manifests, plus any conflict. */
export interface ApiProviderResult {
  /** The provider, when exactly one manifest declares `apiProvider: true`. */
  provider?: SovereignManifest;
  /** All manifests declaring `apiProvider: true` — length > 1 means a conflict. */
  duplicates: SovereignManifest[];
}

/**
 * Resolve the API-namespace provider from a set of manifests (PLT-16). Exactly
 * one plugin per instance may serve the public `/api/*` namespace in v1; this is
 * the shared source of truth for that invariant — the generate script uses it to
 * fail the build on a conflict, and the runtime middleware to find the provider
 * it rewrites `/api/<slug>/*` into.
 */
export function findApiProvider(manifests: readonly SovereignManifest[]): ApiProviderResult {
  const duplicates = manifests.filter((m) => m.apiProvider === true);
  return { provider: duplicates.length === 1 ? duplicates[0] : undefined, duplicates };
}
