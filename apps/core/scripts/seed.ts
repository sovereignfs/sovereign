/**
 * Makes the local accounts a development instance is tried with (an owner, an admin and an ordinary person), once:
 * run it again and it leaves what is there. It reads apps/core/.env.local and .env as `pnpm dev` does, and refuses
 * for any address but one on this machine (src/dev/seed.ts).
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
// No mail goes anywhere here: an account that had to be verified by email could not be made.
process.env.SV_AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';

const { migrateDatabaseOrExit, validateConfigOrExit } = await import('../src/startup');
const { getAuth } = await import('../src/auth');
const { getConfig } = await import('../src/config');
const { getDatabase } = await import('../src/database');
const { DEFAULT_SEED_PASSWORD, SeedError, seedAccounts } = await import('../src/dev/seed');

validateConfigOrExit();
await migrateDatabaseOrExit();
try {
  const password = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD;
  const { created, existing } = await seedAccounts(
    { auth: await getAuth(), database: await getDatabase(), baseUrl: getConfig().url },
    password,
  );
  for (const email of created) console.log(`made ${email}`);
  for (const email of existing) console.log(`kept ${email}`);
  if (created.length > 0) console.log(`They sign in with the password ${password}.`);
} catch (error) {
  if (error instanceof SeedError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
} finally {
  await (await getDatabase()).close();
}
