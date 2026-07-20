import { type PlatformDb, getPlatformSetting, listPluginStatus } from '@sovereignfs/db';
import { getDevelopmentPluginIds, getExamplePluginIds } from './registry';

/** Platform-settings key that persists the Console "Show example apps" toggle. */
export const EXAMPLES_ENABLED_SETTING = 'examples_enabled';

/**
 * Whether the `SOVEREIGN_EXAMPLES_ENABLED` env var enables example plugins. This
 * only *seeds* the default — the persisted Console setting (below) overrides it
 * once an admin flips the toggle. Read at request time (never `NEXT_PUBLIC`), so
 * the container env is honoured and the value is not frozen at build.
 */
export function examplesEnabledByDefault(): boolean {
  const v = process.env.SOVEREIGN_EXAMPLES_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Whether plugin visibility/access gates are bypassed entirely — every
 * installed plugin behaves as enabled, non-example-gated, and open to
 * everyone. Automatic whenever `NODE_ENV === 'development'` (what `next dev`
 * sets for `pnpm dev`): a row-less plugin normally defaults to
 * disabled/access-restricted until an admin visits Console > Plugins, which
 * meant a freshly scaffolded plugin never appeared for its own author in
 * local dev. Deliberately an equality check, not `!== 'production'` — Vitest
 * sets `NODE_ENV=test`, which must keep exercising the real gating logic.
 * Never applies in production, so this never weakens a real deployment's
 * access control.
 */
export function bypassPluginVisibilityInDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Whether `SOVEREIGN_HIDE_DEVELOPMENT_PLUGINS` is set — a hard, deploy-time
 * gate for plugins flagged `development: true` in their manifest. Unlike the
 * examples toggle, this has **no per-plugin override and no persisted Console
 * setting**: it's meant to pin a deployment to "production-ready plugins
 * only," so an explicit `plugin_status` enable row does not undo it. Read at
 * request time (never `NEXT_PUBLIC`), so the container env is honoured and
 * the value is not frozen at build.
 */
export function hideDevelopmentPluginsByEnv(): boolean {
  const v = process.env.SOVEREIGN_HIDE_DEVELOPMENT_PLUGINS?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Resolve whether example apps are shown: the persisted Console setting wins when
 * set (`'true'`/`'false'`); otherwise the `SOVEREIGN_EXAMPLES_ENABLED` env default
 * applies. Pure so the precedence is unit-testable.
 */
export function resolveExamplesEnabled(setting: string | null, envDefault: boolean): boolean {
  if (setting === 'true') return true;
  if (setting === 'false') return false;
  return envDefault;
}

/**
 * Pure resolver for the effective disabled set. A plugin is disabled when it has
 * an explicit `plugin_status` row set to `false`, OR it is an example plugin
 * with no explicit row while examples are off by default. An explicit row always
 * wins, so enabling an example in Console overrides the env default.
 *
 * `developmentIds`/`hideDevelopment` is a separate, unconditional rule: when
 * `hideDevelopment` is true, every id in `developmentIds` is disabled
 * regardless of any `plugin_status` row — see `hideDevelopmentPluginsByEnv`'s
 * doc comment for why this one has no override.
 */
export function computeDisabledPluginIds(
  statusRows: { pluginId: string; enabled: boolean }[],
  exampleIds: string[],
  examplesEnabled: boolean,
  developmentIds: string[] = [],
  hideDevelopment: boolean = false,
): string[] {
  const statusMap = new Map(statusRows.map((r) => [r.pluginId, r.enabled]));
  const disabled = new Set<string>();
  for (const [id, enabled] of statusMap) {
    if (!enabled) disabled.add(id);
  }
  if (!examplesEnabled) {
    for (const id of exampleIds) {
      if (!statusMap.has(id)) disabled.add(id);
    }
  }
  if (hideDevelopment) {
    for (const id of developmentIds) disabled.add(id);
  }
  return [...disabled];
}

/**
 * Resolve the effective "are example apps shown" flag from the DB — the
 * persisted Console setting when set, else the `SOVEREIGN_EXAMPLES_ENABLED`
 * env default. Shared by every caller that needs this single boolean
 * (the disabled-set resolver below, the access-policy resolver for row-less
 * example plugins, and the Console Plugins table's default filter state) so
 * the precedence logic lives in exactly one place.
 */
export async function getExamplesEnabledFlag(pdb: PlatformDb): Promise<boolean> {
  const setting = await getPlatformSetting(pdb, EXAMPLES_ENABLED_SETTING);
  return resolveExamplesEnabled(setting, examplesEnabledByDefault());
}

/**
 * The effective set of disabled plugin IDs — the single source of truth for the
 * middleware route gate, the launcher, root-plugin selection, and portability.
 * Wraps the DB-level `plugin_status` rows with the example/env default rule
 * and the unconditional `SOVEREIGN_HIDE_DEVELOPMENT_PLUGINS` gate.
 */
export async function getDisabledPluginIds(pdb: PlatformDb): Promise<string[]> {
  if (bypassPluginVisibilityInDev()) return [];
  const [statusRows, examplesEnabled] = await Promise.all([
    listPluginStatus(pdb),
    getExamplesEnabledFlag(pdb),
  ]);
  return computeDisabledPluginIds(
    statusRows,
    getExamplePluginIds(),
    examplesEnabled,
    getDevelopmentPluginIds(),
    hideDevelopmentPluginsByEnv(),
  );
}
