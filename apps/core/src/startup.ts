import { ConfigError } from '@sovereignfs/config';
import { getConfig, getDatabaseSettings, getFieldCipher } from './config';
import { getDatabase } from './database';
import { migrateCore } from './db/migrate';

/**
 * Reads and validates the whole configuration. On a problem it prints every one and
 * stops the process with a non-zero exit, rather than serve with a missing or weak
 * secret. Node.js only: `instrumentation.ts` imports it behind a runtime check.
 */
export function validateConfigOrExit(): void {
  try {
    getConfig();
    // Which database, and what its dialect needs: a missing address is a start-up error.
    getDatabaseSettings();
    // A key ring that is set but wrong is an error even though none is required yet, so a
    // typo never turns encryption off.
    getFieldCipher();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`\n${error.message}\n\nSee apps/core/.env.example for every variable.\n`);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Brings the database up to date before core takes a request. Every instance may run this at
 * once: the migration runner applies each migration exactly once. A failure stops the
 * process, because serving against a schema that is not the one the code expects is worse
 * than not serving.
 */
export async function migrateDatabaseOrExit(): Promise<void> {
  try {
    const database = await getDatabase();
    if (database === undefined) return;
    const { applied } = await migrateCore(database);
    if (applied.length > 0) console.log(`Database migrated: ${applied.join(', ')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`\nCore could not bring its database up to date: ${message}\n`);
    process.exit(1);
  }
}
