import { randomBytes } from 'node:crypto';
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

/** A reset link for an account, made as `sovereign-admin accounts reset-link` makes one. */
export async function resetLinkFor(email: string): Promise<string> {
  const token = randomBytes(18).toString('base64url');
  const database = await openDatabase();
  try {
    const { rows } = await database.run('select id from users where email = ?', [email]);
    const now = Date.now();
    const at = (ms: number) => (database.family === 'postgres' ? new Date(ms) : ms);
    await database.run(
      'insert into verifications (id, identifier, value, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      [
        `v-${token}`,
        `reset-password:${token}`,
        String(rows[0]?.id),
        at(now + 3_600_000),
        at(now),
        at(now),
      ],
    );
  } finally {
    await database.close();
  }
  return `/reset-password?token=${encodeURIComponent(token)}`;
}

/** Locks the newest session of an account, as being away too long would (RFC 0006 B4). */
export async function lockNewestSession(email: string): Promise<void> {
  const device = randomBytes(16).toString('base64url');
  const database = await openDatabase();
  try {
    const { rows } = await database.run(
      `select sessions.id as id, users.id as user_id from sessions join users on users.id = sessions.user_id
       where users.email = ? order by sessions.created_at desc limit 1`,
      [email],
    );
    const session = rows[0];
    if (!session) throw new Error(`${email} has no session to lock.`);
    const now = Date.now();
    await database.run(
      'insert into device_locks (user_id, device_id, idle_seconds, on_leave, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      [session.user_id, device, 60, database.family === 'postgres' ? false : 0, now, now],
    );
    await database.run(
      'insert into session_locks (session_id, device_id, last_active_at, locked_at) values (?, ?, ?, ?)',
      [session.id, device, now, now],
    );
  } finally {
    await database.close();
  }
}
