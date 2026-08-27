/**
 * The pure visibility-default policy, split out from `model-visibility.ts`
 * specifically so client components can import it without pulling in
 * `@sovereignfs/sdk` — `model-visibility.ts` calls `sdk.db.getClient()` at
 * module scope, which transitively imports `next/headers` and breaks in a
 * client bundle. This module has no imports at all, so it's safe from
 * either side.
 */

export function isVisibleByDefault(modelKey: string): boolean {
  return modelKey === 'local';
}

/** Resolves whether a model is visible given a user's own override set —
 *  a row present means "flipped away from default," never "hidden" or
 *  "shown" outright. */
export function isModelVisible(modelKey: string, overrides: Set<string>): boolean {
  const defaultVisible = isVisibleByDefault(modelKey);
  return overrides.has(modelKey) ? !defaultVisible : defaultVisible;
}
