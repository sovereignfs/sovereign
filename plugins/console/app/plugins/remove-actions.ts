'use server';

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';
import type { ActionResult } from '../_lib/action-result';
import { adminFetch as sharedAdminFetch } from '../_lib/admin-fetch';

export type { ActionResult } from '../_lib/action-result';

function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return sharedAdminFetch(path, { ...init, actor: true });
}

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

/**
 * Resolve `candidate` to an id that is actually installed, or null.
 *
 * The returned string comes from the registry, never from the request — so the
 * value handed to the subprocess below is drawn from a server-side allowlist
 * rather than merely being pattern-checked. Removal is only ever meaningful for
 * an installed plugin, so this costs nothing in legitimate use.
 */
async function resolveInstalledPluginId(candidate: string): Promise<string | null> {
  const res = await adminFetch('/api/admin/plugins');
  if (!res.ok) return null;
  const installed = (await res.json()) as { id: string; removable?: boolean }[];
  // `removable` is the route's own verdict (the plugin was installed under
  // `plugins/<id>` by `sv plugin add`, not first-party or a `.local` clone) —
  // Console hides Remove for the rest, but an action is reachable directly.
  return installed.find((p) => p.id === candidate && p.removable === true)?.id ?? null;
}

export async function removePluginAction(pluginId: string): Promise<ActionResult> {
  // Server actions are reachable by action id, so the middleware `adminOnly`
  // gate on /console is not on its own a sufficient guard — authorize here,
  // as every other Console action does.
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'plugin:manage')) {
    return { ok: false, error: 'Insufficient privileges to remove apps.' };
  }

  const resolvedId = await resolveInstalledPluginId(pluginId);
  if (!resolvedId) return { ok: false, error: 'Unknown app.' };

  const cwd = workspaceRoot();
  try {
    // execFileSync, not execSync: no shell is spawned, so the argument cannot
    // be interpreted as shell syntax. `JSON.stringify` is not shell quoting —
    // it leaves `$(…)`, backticks and `${…}` live inside the double quotes it
    // adds, which the shell then expands.
    execFileSync('pnpm', ['sv', 'plugin', 'remove', resolvedId], {
      cwd,
      timeout: 60_000,
      stdio: 'pipe',
    });
    revalidatePath('/console/plugins');
    return { ok: true, message: 'App removed. Restart the server to apply in production.' };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, error: raw.slice(0, 400) };
  }
}
