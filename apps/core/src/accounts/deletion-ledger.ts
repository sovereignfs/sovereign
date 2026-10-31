import type { Database } from '@sovereignfs/database';
import { queueDeletionNotice } from './deletion-notices';

/** The setting that holds the newest export already applied, so the same file is applied once (core-app §4.5). */
export const APPLIED_KEY = 'instance.deletions_applied';
const MAX_ENTRIES = 100_000;

/** What `export` writes and `apply` reads: the accounts deleted, with the apps each had used. Holds `sub`s and nothing else of a person. */
export type DeletionsFile = {
  version: 1;
  exportedAt: string;
  deletions: { sub: string; deletedAt: string; apps: string[] }[];
};

export class LedgerError extends Error {
  override name = 'LedgerError';
}

/**
 * The deletions this core remembers (core-app §4.5, "After a restore"): every account deleted in the last 90 days, when, and the apps
 * that were to be told. `sv restore` takes it from the running core before it restores, and gives it to the restored one.
 */
export async function exportDeletions(
  database: Pick<Database, 'run'>,
  now: number = Date.now(),
): Promise<DeletionsFile> {
  const accounts = await database.run(
    'select sub, deleted_at from deleted_accounts order by deleted_at, sub',
  );
  const notices = await database.run('select sub, client_id from account_deletion_notices');
  const apps = new Map<string, Set<string>>();
  for (const row of notices.rows) {
    const set = apps.get(String(row.sub)) ?? new Set<string>();
    set.add(String(row.client_id));
    apps.set(String(row.sub), set);
  }
  return {
    version: 1,
    exportedAt: new Date(now).toISOString(),
    deletions: accounts.rows.map((row) => ({
      sub: String(row.sub),
      deletedAt: new Date(Number(row.deleted_at)).toISOString(),
      apps: [...(apps.get(String(row.sub)) ?? [])].sort(),
    })),
  };
}

/** Reads what `export` wrote, and refuses anything else, saying what is wrong. */
export function parseDeletions(text: string): DeletionsFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new LedgerError('The deletions are not JSON.');
  }
  const file = value as Partial<DeletionsFile> | null;
  if (!file || typeof file !== 'object' || file.version !== 1) {
    throw new LedgerError('The deletions are not a version 1 file.');
  }
  if (typeof file.exportedAt !== 'string' || !Number.isFinite(Date.parse(file.exportedAt))) {
    throw new LedgerError('The deletions have no export time.');
  }
  if (!Array.isArray(file.deletions) || file.deletions.length > MAX_ENTRIES) {
    throw new LedgerError('The deletions have no list, or too long a one.');
  }
  for (const entry of file.deletions as unknown[]) {
    const item = entry as { sub?: unknown; deletedAt?: unknown; apps?: unknown };
    const text = (v: unknown) => typeof v === 'string' && v !== '' && v.length <= 255;
    if (
      !text(item?.sub) ||
      typeof item.deletedAt !== 'string' ||
      !Number.isFinite(Date.parse(item.deletedAt)) ||
      !Array.isArray(item.apps) ||
      !item.apps.every(text)
    ) {
      throw new LedgerError('A deletion in the file is not as expected.');
    }
  }
  return file as DeletionsFile;
}

/** What `apply` did. */
export type Applied = {
  /** The file was already applied, or an earlier one newer than it was: nothing was done. */
  skipped: boolean;
  /** Accounts the restored database had brought back, now deleted again. */
  deletedAgain: number;
  /** Accounts the restored database did not have. */
  alreadyGone: number;
  /** Accounts left, since an owner is never deleted. */
  kept: number;
  /** Notices made for apps. */
  notices: number;
};

/** What deleting an account again takes from the manager. */
export type DeletesAfterRestore = {
  deleteAfterRestore(sub: string): Promise<'deleted' | 'absent' | 'owner'>;
};

/**
 * Gives a restored core the deletions made after its backup (core-app §4.5): each account the backup brought back is deleted the way
 * any deletion is, a notice is made for every app named (told again whether or not it was told before, since a restore returns the apps
 * to their backups too), and the deletion is remembered for the next restore. The notices start their 30 days now, not when the account
 * was deleted. The same file, or an older one, is applied once: the time of the newest export applied is kept.
 */
export async function applyDeletions(
  database: Database,
  manager: DeletesAfterRestore,
  file: DeletionsFile,
  now: number = Date.now(),
): Promise<Applied> {
  const exported = Date.parse(file.exportedAt);
  const before = Number(
    (await database.run('select value from instance_settings where key = ?', [APPLIED_KEY])).rows[0]
      ?.value,
  );
  if (Number.isFinite(before) && exported <= before) {
    return { skipped: true, deletedAgain: 0, alreadyGone: 0, kept: 0, notices: 0 };
  }
  const result: Applied = { skipped: false, deletedAgain: 0, alreadyGone: 0, kept: 0, notices: 0 };
  for (const entry of file.deletions) {
    const outcome = await manager.deleteAfterRestore(entry.sub);
    if (outcome === 'deleted') result.deletedAgain += 1;
    else if (outcome === 'absent') result.alreadyGone += 1;
    else {
      result.kept += 1;
      continue;
    }
    await database.transaction(async (tx) => {
      for (const clientId of entry.apps) {
        if (await queueDeletionNotice(tx, clientId, entry.sub, now)) result.notices += 1;
      }
      await tx.run(
        `insert into deleted_accounts (sub, deleted_at) values (?, ?)
         on conflict (sub) do update set deleted_at = excluded.deleted_at`,
        [entry.sub, Date.parse(entry.deletedAt)],
      );
    });
  }
  await database.run(
    `insert into instance_settings (key, value, encrypted, updated_at, updated_by) values (?, ?, 0, ?, null)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [APPLIED_KEY, String(exported), now],
  );
  return result;
}
