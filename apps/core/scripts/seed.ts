/**
 * Makes the accounts and the sample app a development instance is tried with, once: run it again and it leaves what is there. It is
 * `sovereign-admin seed --local` (core-app §3.15.1), run on this machine: it reads apps/core/.env.local and .env as `pnpm dev` does, says
 * the instance is a development one, and refuses for any address but one on this machine, and for an instance that has an account no seed
 * made. Only `sovereign-admin`'s entry point builds the system actor the sample app needs, so this goes through it.
 *
 *   pnpm seed                         # password: sovereign-dev-password
 *   SEED_PASSWORD=... pnpm seed       # another
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const core = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Migrations and the database file are found from the working directory, as when the server runs.
process.chdir(core);
for (const file of ['.env.local', '.env']) {
  if (existsSync(path.join(core, file))) process.loadEnvFile(path.join(core, file));
}
// This is a development machine whatever the file says: the seed is refused for any other instance, and for an address that is not here.
process.env.SV_ENVIRONMENT = 'development';
// No mail goes anywhere here: an account that had to be verified by email could not be made. This is set before the configuration is
// read, which happens once.
process.env.SV_AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';

const { migrateDatabaseOrExit, validateConfigOrExit } = await import('../src/startup');
validateConfigOrExit();
await migrateDatabaseOrExit();

// The entry point reads its command from the arguments, and ends the process with the code the command gave.
process.argv = [process.argv[0] as string, process.argv[1] as string, 'seed', '--local'];
await import('../src/admin/main');
