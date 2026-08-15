/**
 * generate-registry — composes installed plugins into the runtime.
 *
 * Scans `plugins/<dir>/manifest.json`, validates each via `@sovereignfs/manifest`,
 * writes the typed plugin registry to `runtime/generated/registry.ts`, and links
 * each plugin's `app/` into the runtime App Router at its `routePrefix`. An
 * invalid manifest fails the build.
 *
 * Copies in dev, symlinks in production (`NODE_ENV`) — deliberately different
 * per environment, revisiting an earlier version of this file that used copies
 * everywhere:
 *   - Dev must use copies. Next's dev route watcher does not discover routes
 *     through symlinked directories — a symlinked plugin genuinely 404s under
 *     `next dev` (verified against Next 15.5.19; this is not an old/fixed
 *     limitation). `scripts/dev.ts` runs this in `--watch` mode so edits under
 *     `plugins/` re-copy and trigger HMR.
 *   - Production uses a symlink instead of a copy specifically so a composed
 *     plugin's imports resolve through *its own* `node_modules` (correct pnpm
 *     per-package isolation) rather than requiring every dependency a bundled
 *     plugin happens to use to also be hand-declared in `runtime/package.json`
 *     — a copy severs the file from its originating package, which is what
 *     broke the first production build that bundled a plugin with
 *     dependencies `runtime` didn't already have (`@dnd-kit/*`, `rrule` for
 *     Tasks). `next build`'s webpack does follow the symlink correctly; only
 *     `next dev`'s route discovery doesn't.
 *   - TypeScript's own module resolution does not follow the symlink to find
 *     a plugin's `node_modules` either (confirmed: `preserveSymlinks` doesn't
 *     change this) — so `runtime/tsconfig.json` excludes composed plugin
 *     directories from its own type-check scope. This isn't a loss: each
 *     plugin already typechecks itself in its own repo/CI.
 *
 * Composition target is chosen by the manifest `shell` value so the plugin
 * inherits the right layout from the route tree (no per-request branching):
 *   - `default` (or omitted) → `runtime/app/(platform)/(plugins)/<routePrefix>/`,
 *     which sits under the platform sidebar shell.
 *   - `minimal` → `runtime/app/(minimal)/<routeSegment>` — chrome-free,
 *     full-bleed; multi-segment routePrefix allowed (e.g. /kiosk/display).
 *     The session gate still applies (middleware is not bypassed).
 *
 * The route segment is the manifest `routePrefix` (not the source directory
 * name), so `routePrefix` is the single source of truth for a plugin's URL.
 *
 * Run via `pnpm generate`; the runtime dev script runs it before `next dev`.
 * Pass `--watch` to re-run when plugin directories are added or removed.
 *
 * `example-plugins/` (the in-repo teaching/fixture set, `docs/epics/example-plugins.md`)
 * is scanned alongside `plugins/` only when `SOVEREIGN_EXAMPLES_ENABLED` is
 * truthy — off by default, so a plain build never ships or composes example
 * routes unless explicitly opted in. This is distinct from (but shares the
 * env var with) `runtime/src/plugin-status.ts`'s `examplesEnabledByDefault()`,
 * which gates *visibility* of whatever this step already composed — see that
 * module's doc comment and `docs/self-hosting.md` for the two-layer model.
 *
 * See: SRS §3.9 Plugin Loading Model.
 *
 * Implementation lives in `scripts/generate/` (one module per concern —
 * `read-plugins.ts`, `compose-routes.ts`, `plugin-icons.ts`, `plugin-env.ts`,
 * `plugin-capabilities.ts`, `plugin-schedules.ts`, `plugin-jobs.ts`,
 * `plugin-events.ts`, `write-registry.ts`). This file is the CLI entrypoint:
 * orchestration, `--watch` mode, and the re-exports below (kept so existing
 * imports of `../generate-registry` — notably its own test suite — don't need
 * to track which module a given symbol lives in).
 */
import { existsSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { composePlugins } from './generate/compose-routes';
import { copyPluginIcons } from './generate/plugin-icons';
import { writePluginCapabilities } from './generate/plugin-capabilities';
import { processPluginEnv, writePluginEnv } from './generate/plugin-env';
import { writePluginEvents } from './generate/plugin-events';
import { writePluginJobs } from './generate/plugin-jobs';
import { EXAMPLE_PLUGINS_DIR, PLUGINS_DIR } from './generate/paths';
import { examplesEnabledForBuild, readPlugins } from './generate/read-plugins';
import { writePluginSchedules } from './generate/plugin-schedules';
import { writeRegistry } from './generate/write-registry';

export {
  collectPluginEnv,
  parseEnvFile,
  renderPluginEnv,
  type EnvDecl,
  type PluginEnvResult,
} from './generate/plugin-env';
export { collectPluginJobs, renderPluginJobs, type JobDecl } from './generate/plugin-jobs';
export {
  collectPluginEvents,
  renderPluginEvents,
  type EventAuthorizerDecl,
} from './generate/plugin-events';
export {
  collectPluginSchedules,
  renderPluginSchedules,
  type ScheduleDecl,
} from './generate/plugin-schedules';
export { renderPluginCapabilities } from './generate/plugin-capabilities';
export {
  duplicateApiProviders,
  duplicatePluginIds,
  examplesEnabledForBuild,
  sortPluginEntries,
} from './generate/read-plugins';
export {
  linkOrCopyTarget,
  pruneGeneratedEntries,
  resolveComposeTargets,
  type ComposeTargetDirs,
  type ComposeTargetResult,
} from './generate/compose-routes';
export { pruneStalePluginIcons } from './generate/plugin-icons';
export { renderRegistry } from './generate/write-registry';
export type { PluginEntry } from './generate/types';

// See the module doc comment above for why this differs from dev: symlinks
// let a composed plugin resolve its own dependencies via its own
// node_modules, but Next's dev route watcher doesn't discover routes through
// symlinked directories, so dev must keep using real copies.
const isProd = process.env.NODE_ENV === 'production';

export async function generate(): Promise<void> {
  const plugins = readPlugins();
  writeRegistry(plugins);
  composePlugins(plugins, isProd);
  await copyPluginIcons(plugins);
  const envDecls = processPluginEnv(plugins);
  writePluginEnv(envDecls);
  writePluginCapabilities(plugins);
  writePluginSchedules(plugins);
  writePluginJobs(plugins);
  writePluginEvents(plugins);
  console.log(
    `[generate] ${String(plugins.length)} plugin(s) composed (${isProd ? 'symlink' : 'copy'}` +
      `${examplesEnabledForBuild() ? ', examples included' : ''}).`,
  );
}

function isCliEntrypoint(): boolean {
  return resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  await generate();
}

if (isCliEntrypoint() && process.argv.includes('--watch')) {
  const watchExamples = examplesEnabledForBuild();
  console.log(
    `[generate] watching plugins/${watchExamples ? ' and example-plugins/' : ''} for changes…`,
  );
  let timer: NodeJS.Timeout | undefined;
  watch(PLUGINS_DIR, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(generate, 150);
  });
  if (watchExamples && existsSync(EXAMPLE_PLUGINS_DIR)) {
    watch(EXAMPLE_PLUGINS_DIR, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(generate, 150);
    });
  }
}
