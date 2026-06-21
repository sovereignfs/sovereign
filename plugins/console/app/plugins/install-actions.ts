'use server';

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';

export interface ManifestPreview {
  id: string;
  name: string;
  version: string;
  description: string | null;
  type: string;
}

export type CheckResult = { ok: true; manifest: ManifestPreview } | { ok: false; error: string };
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Walk up from cwd to find the monorepo root (contains pnpm-workspace.yaml). */
function workspaceRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

function rawManifestUrl(repoUrl: string): string {
  const url = repoUrl.trim().replace(/\.git$/, '');
  const gh = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)/);
  if (gh) return `https://raw.githubusercontent.com/${gh[1]}/HEAD/manifest.json`;
  // GitLab / Gitea / Forgejo pattern
  return `${url}/raw/HEAD/manifest.json`;
}

function isManifestShape(
  v: unknown,
): v is { id: string; name: string; version: string; type: string; description?: string } {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m['id'] === 'string' &&
    typeof m['name'] === 'string' &&
    typeof m['version'] === 'string' &&
    typeof m['type'] === 'string'
  );
}

export async function checkPluginManifestAction(repoUrl: string): Promise<CheckResult> {
  if (!repoUrl.trim()) return { ok: false, error: 'Repository URL is required.' };

  let json: unknown;
  try {
    const res = await fetch(rawManifestUrl(repoUrl), { cache: 'no-store' });
    if (!res.ok)
      return {
        ok: false,
        error: `Could not fetch manifest.json (HTTP ${res.status}). Make sure the repository is public and has a manifest.json at the root.`,
      };
    json = await res.json();
  } catch {
    return { ok: false, error: 'Failed to fetch or parse manifest.json from the repository.' };
  }

  if (!isManifestShape(json)) {
    return {
      ok: false,
      error: 'manifest.json is missing required fields (id, name, version, type).',
    };
  }

  return {
    ok: true,
    manifest: {
      id: json.id,
      name: json.name,
      version: json.version,
      description: typeof json.description === 'string' ? json.description : null,
      type: json.type,
    },
  };
}

export async function installPluginAction(repoUrl: string): Promise<ActionResult> {
  const cwd = workspaceRoot();
  try {
    execSync(`pnpm sv plugin add ${JSON.stringify(repoUrl)}`, {
      cwd,
      timeout: 120_000,
      stdio: 'pipe',
    });
    revalidatePath('/console/plugins');
    return {
      ok: true,
      message: 'Plugin installed. Restart the server to activate it in production.',
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, error: raw.slice(0, 400) };
  }
}

export async function removePluginAction(pluginId: string): Promise<ActionResult> {
  const cwd = workspaceRoot();
  try {
    execSync(`pnpm sv plugin remove ${JSON.stringify(pluginId)}`, {
      cwd,
      timeout: 60_000,
      stdio: 'pipe',
    });
    revalidatePath('/console/plugins');
    return { ok: true, message: 'Plugin removed. Restart the server to apply in production.' };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, error: raw.slice(0, 400) };
  }
}
