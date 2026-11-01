import { readFile } from 'node:fs/promises';
import { ConfigError } from '@sovereignfs/config';
import { AccountManager } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import { applyDeletions, exportDeletions, parseDeletions } from '../accounts/deletion-ledger';
import { getAuth } from '../auth';
import { getAuthSettings } from '../auth/settings';
import { getClientRegistry } from '../clients';
import { systemActor } from '../clients/system-actor';
import { getConfig, getDatabaseSettings } from '../config';
import { getDatabase } from '../database';
import { seedInstance } from '../dev/seed';
import { recordRestore } from '../instance/restore';
import { runAdmin } from './run';

/**
 * The entry point of `sovereign-admin`, which core's image ships (core-app §3.7.4). It runs inside the container, so it
 * reads the same environment the server does and acts on the same database. This file is the only place the system
 * actor is built; `system-actor.test.ts` holds that.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

// A seeded account is made verified, so no mail is sent for it: with verification asked for, sign-up would try to send one.
if (process.argv[2] === 'seed') process.env.SV_AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';

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
    const registry = await getClientRegistry();
    const actor = systemActor();
    return await runAdmin(
      process.argv.slice(2),
      registry,
      actor,
      {
        out: (line) => console.log(line),
        log: (line) => console.error(line),
      },
      {
        restore: () => recordRestore(database),
        exportDeletions: async () => JSON.stringify(await exportDeletions(database), null, 2),
        seed: async ({ local }) => {
          const config = getConfig();
          return seedInstance({
            auth: await getAuth(),
            database,
            baseUrl: config.url,
            environment: config.environment,
            registry,
            actor,
            passwordPolicy: getAuthSettings().passwordPolicy,
            password: process.env.SEED_PASSWORD,
            local,
          });
        },
        applyDeletions: async (file) => {
          // No sending from here: the notices wait in the table, and core sends them when it starts.
          const manager = new AccountManager(database, new AccountStates(database), {
            log: (line) => console.error(line),
          });
          const text = file === undefined ? await readStdin() : await readFile(file, 'utf8');
          return applyDeletions(database, manager, parseDeletions(text));
        },
      },
    );
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
