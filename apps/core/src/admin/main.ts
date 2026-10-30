import { ConfigError } from '@sovereignfs/config';
import { getClientRegistry } from '../clients';
import { systemActor } from '../clients/system-actor';
import { getConfig, getDatabaseSettings } from '../config';
import { getDatabase } from '../database';
import { runAdmin } from './run';

/**
 * The entry point of `sovereign-admin`, which core's image ships (core-app §3.7.4). It runs inside the container, so it
 * reads the same environment the server does and acts on the same database. This file is the only place the system
 * actor is built; `system-actor.test.ts` holds that.
 */
async function main(): Promise<number> {
  try {
    getConfig();
    getDatabaseSettings();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`sovereign-admin: ${error.message}`);
      return 2;
    }
    throw error;
  }
  const database = await getDatabase();
  try {
    return await runAdmin(process.argv.slice(2), await getClientRegistry(), systemActor(), {
      out: (line) => console.log(line),
      log: (line) => console.error(line),
    });
  } finally {
    await database.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `sovereign-admin: ${error instanceof Error ? error.message : 'it failed for a reason unknown'}`,
    );
    process.exit(1);
  },
);
