import {
  coreEnvironment,
  createTestDatabase,
  databaseEnvironment,
  startCore,
  waitForHealth,
} from './core';
import { world } from './world';

/**
 * Starts the built core on a database of its own (the dialect the run names with SV_DB_DIALECT, as the database
 * tests do), and stops it and removes the database afterwards.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  world.reset();
  const database = await createTestDatabase();
  // The steps reach the same database to do what only the instance's own mail would let them do.
  world.set('database', databaseEnvironment(database));
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
