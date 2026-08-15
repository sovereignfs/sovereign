/**
 * Shared filesystem paths and the platform-version reader used across the
 * `generate-registry` decomposition. Kept in one place because every other
 * module in `scripts/generate/` needs a subset of these.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PLUGINS_DIR = join(ROOT, 'plugins');
export const EXAMPLE_PLUGINS_DIR = join(ROOT, 'example-plugins');
export const PLUGIN_ICONS_DIR = join(ROOT, 'runtime', 'public', 'plugin-icons');
export const PLUGIN_ENV_FILE = join(ROOT, 'runtime', 'generated', 'plugin-env.ts');
export const PLUGIN_CAPABILITIES_FILE = join(
  ROOT,
  'runtime',
  'generated',
  'plugin-capabilities.ts',
);
export const PLUGIN_SCHEDULES_FILE = join(ROOT, 'runtime', 'generated', 'plugin-schedules.ts');
export const PLUGIN_JOBS_FILE = join(ROOT, 'runtime', 'generated', 'plugin-jobs.ts');
export const PLUGIN_EVENTS_FILE = join(ROOT, 'runtime', 'generated', 'plugin-events.ts');
export const GENERATED_DIR = join(ROOT, 'runtime', 'generated');

export function readPlatformVersion(): string {
  try {
    return (
      (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: string })
        .version ?? '0.0.0'
    );
  } catch {
    return '0.0.0';
  }
}

// Default-shell plugins compose under the platform route group so they inherit
// the sidebar shell. `(plugins)` is a URL-transparent route group; the public
// path is the plugin's routePrefix.
export const PLATFORM_PLUGINS_DIR = join(ROOT, 'runtime', 'app', '(platform)', '(plugins)');
// Overlay-shell interception copies (RFC 0001) compose under the @modal
// parallel-route slot *inside* the (plugins) group, as `(.)<routePrefix>`, so an
// overlay plugin's interception copy and its full-page fallback are
// folder-siblings within the same group (required for Next.js `(.)` interception
// to resolve). The slot's hand-written default.tsx + layout.tsx (Dialog chrome)
// live alongside and are preserved.
export const MODAL_DIR = join(PLATFORM_PLUGINS_DIR, '@modal');
// Committed files inside (plugins) that the clear step must never delete.
export const PLUGINS_DIR_KEEP = new Set(['.gitignore', 'layout.tsx', '@modal']);
// Minimal-shell plugins compose under (minimal) — chrome-free, full-bleed (RFC 0014).
export const MINIMAL_DIR = join(ROOT, 'runtime', 'app', '(minimal)');
// Committed files inside (minimal) that the clear step must never delete.
export const MINIMAL_DIR_KEEP = new Set(['.gitignore', 'layout.tsx', 'minimal.module.css']);
export const REGISTRY_FILE = join(ROOT, 'runtime', 'generated', 'registry.ts');
