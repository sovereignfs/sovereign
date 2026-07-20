/**
 * sv user reset-mfa <email> — break-glass MFA reset.
 *
 * Removes all TOTP secrets, backup codes, and registered passkeys for the
 * specified user, and clears the twoFactorEnabled flag. The user can then sign
 * in with their password alone and re-enroll MFA. Requires direct database
 * access (use the admin Console UI for a softer approach).
 */
import {
  checkEncryptionMarker,
  dbEncryptionKeyFromEnv,
  DbEncryptionConfigError,
  defaultDataDir,
  findWorkspaceRoot,
  openKeyedSqlite,
} from '@sovereignfs/db';
import { resolve } from 'node:path';
import { consola } from 'consola';

const email = process.argv[2];
if (!email) {
  consola.error('Usage: sv user reset-mfa <email>');
  process.exit(1);
}

const root = findWorkspaceRoot();
const authDbPath = resolve(root, 'data', 'auth.db');

let db: ReturnType<typeof openKeyedSqlite>;
try {
  const key = dbEncryptionKeyFromEnv();
  checkEncryptionMarker(defaultDataDir(), key !== undefined);
  db = openKeyedSqlite(authDbPath, key);
} catch (err) {
  if (err instanceof DbEncryptionConfigError) {
    consola.error(err.message);
  } else {
    consola.error(`Could not open auth database at ${authDbPath}`);
    consola.info('Make sure the instance has been started at least once.');
  }
  process.exit(1);
}

const user = db.prepare('SELECT id, email FROM "user" WHERE email = ?').get(email) as
  | { id: string; email: string }
  | undefined;

if (!user) {
  consola.error(`No user found with email: ${email}`);
  process.exit(1);
}

consola.info(`Resetting MFA for ${user.email} (${user.id})`);

db.prepare('DELETE FROM "twoFactor" WHERE userId = ?').run(user.id);
db.prepare('DELETE FROM "passkey" WHERE userId = ?').run(user.id);
db.prepare('UPDATE "user" SET twoFactorEnabled = 0 WHERE id = ?').run(user.id);

consola.success(`MFA reset complete. ${user.email} can now sign in with password only.`);
