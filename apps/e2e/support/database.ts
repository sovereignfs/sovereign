import { defineConfig } from '@sovereignfs/config';
import { connect, databaseVariables, resolveDatabase, type Database } from '@sovereignfs/database';
import { world } from './world';

/** Opens the database the run's core uses, by the variables core was given. */
export async function openDatabase(): Promise<Database> {
  const variables = world.get<Record<string, string>>('database');
  const loaded = defineConfig({ prefix: 'SV', variables: databaseVariables }).load(variables);
  return connect(resolveDatabase(loaded, { prefix: 'SV', required: true }));
}

/**
 * Marks an address verified. Core sends the link by email and no mail goes anywhere in the suite, so the one
 * step that needs a verified address (turning on two-factor sign-in) is given the fact the link would have set.
 */
export async function verifyEmail(email: string): Promise<void> {
  const database = await openDatabase();
  try {
    const verified = database.dialect === 'postgres' ? true : 1;
    const result = await database.run('update users set email_verified = ? where email = ?', [
      verified,
      email,
    ]);
    if (result.rowsAffected !== 1) throw new Error(`No account is signed up as ${email}.`);
  } finally {
    await database.close();
  }
}
