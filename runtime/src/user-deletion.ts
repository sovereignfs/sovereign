import { existsSync, rmSync } from 'node:fs';
import { deleteUserData, hardDeleteUserStorageObjects } from '@sovereignfs/db';
import { manifestDatabaseDialect, manifestDatabaseIsolation } from '@sovereignfs/manifest';
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
  errors: string[];
}

/**
 * Full account deletion cascade (RFC 0033).
 *
 * 1. Run all registered plugin deletion handlers in parallel (30 s timeout each).
 * 2. Delete all platform-table rows for the user in dependency order.
 * 3. Remove the avatar file from disk.
 * 4. Remove user-owned plugin storage objects (RFC 0044): row + physical file.
 * 5. Call better-auth admin API to remove the user record.
 *
 * Partial plugin failures are recorded in the summary but do not abort the
 * platform deletion — orphaned plugin rows are the operator's responsibility.
 */
export async function deleteUser(userId: string, tenantId: string): Promise<DeletionSummary> {
  const errors: string[] = [];

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
        if (manifest && manifestDatabaseIsolation(manifest.database) === 'isolated') {
          db = getPluginDb(pluginId, manifestDatabaseDialect(manifest.database)).db;
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

  // --- Phase 5: remove user from better-auth ---
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
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

  return { pluginResults, platformRowsDeleted, avatarDeleted, storageObjectsDeleted, errors };
}
