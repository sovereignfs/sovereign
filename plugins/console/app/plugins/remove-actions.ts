'use server';

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';

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
