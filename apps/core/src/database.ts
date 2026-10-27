import { connect, type Database } from '@sovereignfs/database';
import { getDatabaseSettings } from './config';

let opened: Promise<Database> | undefined;

/**
 * Core's database, opened on first use and kept for the life of the process. Core cannot run
 * without one (accounts live in it), so a missing configuration rejects with the `ConfigError`
 * that names the variables. A failed attempt is not remembered, so the next call tries again.
 */
export async function getDatabase(): Promise<Database> {
  const settings = getDatabaseSettings();
  opened ??= connect(settings, { createNamespace: true }).catch((error: unknown) => {
    opened = undefined;
    throw error;
  });
  return opened;
}
