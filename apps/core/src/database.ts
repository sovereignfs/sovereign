import { connect, type Database } from '@sovereignfs/database';
import { getDatabaseSettings } from './config';

let opened: Promise<Database | undefined> | undefined;

/**
 * Core's database, opened on first use and kept for the life of the process. `undefined`
 * when no database is configured. A failed attempt is not remembered, so the next call
 * tries again.
 */
export function getDatabase(): Promise<Database | undefined> {
  const settings = getDatabaseSettings();
  if (settings === undefined) return Promise.resolve(undefined);
  opened ??= connect(settings, { createNamespace: true }).catch((error: unknown) => {
    opened = undefined;
    throw error;
  });
  return opened;
}
