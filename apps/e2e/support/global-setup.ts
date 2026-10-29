import { coreEnvironment, createTestDatabase, startCore, waitForHealth } from './core';

/**
 * Starts the built core on a database of its own (the dialect the run names with SV_DB_DIALECT, as the database
 * tests do), and stops it and removes the database afterwards.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const database = await createTestDatabase();
  const core = await startCore(coreEnvironment(database));
  try {
    await waitForHealth(core);
  } catch (error) {
    await core.stop();
    await database.cleanup();
    throw error;
  }
  return async () => {
    await core.stop();
    await database.cleanup();
  };
}
