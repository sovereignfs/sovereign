import { existsSync, rmSync } from 'node:fs';
import {
  deleteUserData,
  dropPluginDb,
  hardDeleteUserE2eeData,
  hardDeleteUserStorageObjects,
} from '@sovereignfs/db';
import { manifestDatabaseIsolation } from '@sovereignfs/manifest';
import type { DeletionResult } from '@sovereignfs/sdk';
import { getPlatformDb } from './db';
import { findAvatarFile } from './avatars';
import { getAllDeleters } from './portability/registry';
import { getPluginDb } from '@sovereignfs/db';
import { getInstalledPlugins } from './registry';
import { deleteObjectBytes } from './storage';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;
const DELETION_TIMEOUT_MS = 30_000;

export interface PluginDeletionResult {
  pluginId: string;
  result?: DeletionResult;
  error?: string;
  skipped?: boolean;
}

export interface DeletionSummary {
  pluginResults: PluginDeletionResult[];
  platformRowsDeleted: number;
  avatarDeleted: boolean;
  storageObjectsDeleted: number;
  droppedPluginDbs: string[];
  errors: string[];
}

/**
 * Full account deletion cascade (RFC 0033).
 *
 * 1. Run all registered plugin deletion handlers in parallel (30 s timeout each).
 * 1b. If the deleted user was the only user on this instance, drop every
 *     isolated plugin's entire database outright — the fallback for a
 *     plugin that registers no deletion handler at all.
 * 2. Delete all platform-table rows for the user in dependency order.
 * 3. Remove the avatar file from disk.
 * 4. Remove user-owned plugin storage objects (RFC 0044): row + physical file.
 * 5. Remove client-side encryption profile/wrapper/device rows (RFC 0060) —
 *    ciphertext-only, so this is unconditional and safe.
 * 6. Call better-auth admin API to remove the user record.
 *
 * Partial plugin failures are recorded in the summary but do not abort the
 * platform deletion — orphaned plugin rows are the operator's responsibility.
 */
export async function deleteUser(userId: string, tenantId: string): Promise<DeletionSummary> {
  const errors: string[] = [];
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';

  // Resolve sole-user status up front, before anything else runs. Must
  // happen now rather than after Phase 6 — once better-auth's user record is
  // removed, the instance's membership count reflects post-deletion state,
  // not the state that should gate the isolated-DB drop decision below.
  let isSoleUser = false;
  try {
    const usersRes = await fetch(`${AUTH_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminKey}` },
    });
    if (usersRes.ok) {
      const members = (await usersRes.json()) as Array<{ id: string | null }>;
      isSoleUser = members.filter((m) => m.id).length === 1;
    }
  } catch {
    // Best-effort — if membership can't be determined, fall through with
    // isSoleUser = false so no isolated plugin database gets dropped rather
    // than guessing.
  }

  // --- Phase 1: plugin handlers ---
  const deleters = getAllDeleters();
  const installedPlugins = getInstalledPlugins();

  // Note plugins that are installed but have no handler.
  const installedWithoutHandler = installedPlugins
    .filter((p) => !deleters.find(([id]) => id === p.id))
    .map((p) => p.id);

  const pluginResults: PluginDeletionResult[] = installedWithoutHandler.map((pluginId) => ({
    pluginId,
    skipped: true,
  }));

  const handlerPromises = deleters.map(
    async ([pluginId, handler]): Promise<PluginDeletionResult> => {
      const manifest = installedPlugins.find((p) => p.id === pluginId);
      let db: unknown;
      try {
        if (manifest && manifestDatabaseIsolation(manifest.type) === 'isolated') {
          db = getPluginDb(pluginId).db;
        } else {
          db = (await getPlatformDb()).db;
        }
      } catch (e) {
        return {
          pluginId,
          error: `Failed to get DB for plugin: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      try {
        const result = await Promise.race([
          handler({ userId, tenantId, db }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Deletion handler timed out after 30 s')),
              DELETION_TIMEOUT_MS,
            ),
          ),
        ]);
        return { pluginId, result };
      } catch (e) {
        return {
          pluginId,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  const handlerResults = await Promise.all(handlerPromises);
  pluginResults.push(...handlerResults);

  for (const r of handlerResults) {
    if (r.error) errors.push(`Plugin ${r.pluginId}: ${r.error}`);
  }

  // --- Phase 1b: drop isolated plugin databases on sole-user deletion (RFC 0033) ---
  // provideDelete (Phase 1) cleans a plugin's own rows when it registers a
  // handler, but a plugin that registers none leaves its entire isolated
  // database behind. On a single-user instance that database holds no other
  // tenant's data, so RFC 0033 intends it to be dropped outright rather than
  // orphaned. Runs after every provideDelete handler has already had its
  // chance — harmless even for a plugin that already cleaned its own rows.
  const droppedPluginDbs: string[] = [];
  if (isSoleUser) {
    for (const manifest of installedPlugins) {
      if (manifestDatabaseIsolation(manifest.type) !== 'isolated') continue;
      try {
        await dropPluginDb(manifest.id);
        droppedPluginDbs.push(manifest.id);
      } catch (e) {
        errors.push(
          `Failed to drop isolated database for plugin ${manifest.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  // --- Phase 2: platform table rows ---
  const pdb = await getPlatformDb();
  const { platformRowsDeleted } = await deleteUserData(pdb, userId);

  // --- Phase 3: avatar file ---
  let avatarDeleted = false;
  const avatarPath = findAvatarFile(userId);
  if (avatarPath && existsSync(avatarPath)) {
    try {
      rmSync(avatarPath);
      avatarDeleted = true;
    } catch (e) {
      errors.push(`Avatar deletion failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // --- Phase 4: user-owned plugin storage objects (RFC 0044) ---
  // Row deletion (hardDeleteUserStorageObjects) happens first and always wins —
  // an orphaned physical file the operator can clean up later is far better
  // than a metadata row pointing at bytes we failed to delete.
  const deletedStorageRows = await hardDeleteUserStorageObjects(pdb, userId, tenantId);
  let storageObjectsDeleted = 0;
  for (const row of deletedStorageRows) {
    try {
      deleteObjectBytes(row.pluginId, row.id);
      storageObjectsDeleted++;
    } catch (e) {
      errors.push(
        `Storage object ${row.id} (plugin ${row.pluginId}) file deletion failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // --- Phase 5: client-side encryption data (RFC 0060) ---
  await hardDeleteUserE2eeData(pdb, userId, tenantId);

  // --- Phase 6: remove user from better-auth ---
  const authRes = await fetch(`${AUTH_URL}/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${adminKey}`,
      Origin: AUTH_URL,
    },
  });
  if (!authRes.ok) {
    errors.push(`Auth server user removal failed: ${authRes.status}`);
  }

  return {
    pluginResults,
    platformRowsDeleted,
    avatarDeleted,
    storageObjectsDeleted,
    droppedPluginDbs,
    errors,
  };
}
