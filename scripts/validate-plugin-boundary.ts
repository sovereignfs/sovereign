/**
 * validate-plugin-boundary — pre-commit guard against locally-developed plugin
 * content leaking into tracked platform files.
 *
 * A plugin under active local development (e.g. `plugins/sovereign-tasks.local`)
 * is a full pnpm workspace member — that's what lets `pnpm dev` resolve its
 * deps and serve its routes live. As a side-effect, its presence routinely
 * produces local diffs in normally-tracked, generated platform files:
 *   - pnpm-lock.yaml                       — gains an importers entry for the plugin directory
 *   - runtime/generated/registry.ts        — gains a manifest entry for the plugin
 *   - runtime/generated/plugin-capabilities.ts — gains the plugin's declared capabilities
 *   - runtime/generated/plugin-schedules.ts    — gains the plugin's declared schedules
 *
 * This script detects when those files are accidentally staged and silently
 * removes them from the commit (git restore --staged), leaving the on-disk
 * content completely untouched so the developer's local workflow is
 * uninterrupted. "Local" is derived from git-tracked state: any plugins/<dir>
 * whose manifest.json is not in the git index is treated as local-only.
 *
 * The convention for local-dev plugin directories is the `.local` suffix
 * (e.g. `plugins/sovereign-tasks.local`). See docs/plugin-development.md.
 *
 * Run from the pre-commit hook after lint-staged.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function stagedFiles(): string[] {
  return execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function stagedContent(path: string): string | null {
  try {
    return execFileSync('git', ['show', `:${path}`], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

/** Plugin directory names with a tracked manifest.json (includes newly-staged ones). */
function trackedPluginDirs(): Set<string> {
  const files = execFileSync('git', ['ls-files', 'plugins/*/manifest.json'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  return new Set(files.map((f) => f.split('/')[1]));
}

function trackedPluginIds(dirs: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const dir of dirs) {
    try {
      const manifest = JSON.parse(readFileSync(`plugins/${dir}/manifest.json`, 'utf8')) as {
        id?: string;
      };
      if (manifest.id) ids.add(manifest.id);
    } catch {
      // Unparsable manifest is a separate, pre-existing problem — not this script's concern.
    }
  }
  return ids;
}

function unstage(file: string): void {
  execFileSync('git', ['restore', '--staged', file]);
}

interface Fix {
  file: string;
  reason: string;
}

const fixes: Fix[] = [];
const staged = stagedFiles();
const trackedDirs = trackedPluginDirs();
const trackedIds = trackedPluginIds(trackedDirs);

if (staged.includes('pnpm-lock.yaml')) {
  const lock = stagedContent('pnpm-lock.yaml') ?? '';
  for (const line of lock.split('\n')) {
    const match = /^\s{2}(['"]?)plugins\/([^:'"]+)\1:/.exec(line);
    if (match && !trackedDirs.has(match[2])) {
      fixes.push({
        file: 'pnpm-lock.yaml',
        reason: `references untracked plugin directory: plugins/${match[2]}`,
      });
      break;
    }
  }
}

if (staged.includes('pnpm-workspace.yaml')) {
  const ws = stagedContent('pnpm-workspace.yaml') ?? '';
  for (const line of ws.split('\n')) {
    const match = /^\s*-\s*'!?(plugins\/[^*'"]+)'/.exec(line);
    if (match) {
      fixes.push({
        file: 'pnpm-workspace.yaml',
        reason: `contains a named plugin entry (${match[1]}) — only generic glob patterns allowed`,
      });
      break;
    }
  }
}

if (staged.includes('runtime/generated/registry.ts')) {
  const registry = stagedContent('runtime/generated/registry.ts') ?? '';
  // Only the top-level manifest "id" (4-space indent in the generated array of
  // objects) — deeper-nested "id" fields belong to manifest sub-structures
  // (e.g. a plugin's own pricing tiers) and aren't plugin identifiers.
  for (const match of registry.matchAll(/^ {4}"id":\s*"([^"]+)"/gm)) {
    const id = match[1];
    if (!trackedIds.has(id)) {
      fixes.push({
        file: 'runtime/generated/registry.ts',
        reason: `registers untracked plugin id: ${id}`,
      });
      break;
    }
  }
}

if (staged.includes('runtime/generated/plugin-capabilities.ts')) {
  const capabilities = stagedContent('runtime/generated/plugin-capabilities.ts') ?? '';
  for (const match of capabilities.matchAll(/^ {4}"pluginId":\s*"([^"]+)"/gm)) {
    const id = match[1];
    if (!trackedIds.has(id)) {
      fixes.push({
        file: 'runtime/generated/plugin-capabilities.ts',
        reason: `declares a capability for untracked plugin id: ${id}`,
      });
      break;
    }
  }
}

if (staged.includes('runtime/generated/plugin-schedules.ts')) {
  const schedules = stagedContent('runtime/generated/plugin-schedules.ts') ?? '';
  for (const match of schedules.matchAll(/^ {4}pluginId:\s*"([^"]+)"/gm)) {
    const id = match[1];
    if (!trackedIds.has(id)) {
      fixes.push({
        file: 'runtime/generated/plugin-schedules.ts',
        reason: `declares a schedule for untracked plugin id: ${id}`,
      });
      break;
    }
  }
}

for (const file of staged) {
  const dirMatch = /^plugins\/([^/]+)\//.exec(file);
  if (dirMatch && !trackedDirs.has(dirMatch[1])) {
    fixes.push({
      file,
      reason: `path under untracked plugin directory: plugins/${dirMatch[1]}`,
    });
  }
}

if (fixes.length > 0) {
  const uniqueFiles = [...new Set(fixes.map((f) => f.file))];
  for (const file of uniqueFiles) unstage(file);

  console.log('\n[plugin-boundary] Removed from this commit (local plugin dev — disk unchanged):');
  for (const fix of fixes) console.log(`  ${fix.file} — ${fix.reason}`);
  console.log('');
}
