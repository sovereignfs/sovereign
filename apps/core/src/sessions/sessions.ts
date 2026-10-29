import type { Database } from '@sovereignfs/database';
import type { Auth } from '../auth/auth';
import { describeAddress, describeDevice } from './device';

/** What the person sees of one of their sessions. It never carries the session's token. */
export type SessionSummary = {
  id: string;
  /** The session this very request is using. */
  current: boolean;
  device: string;
  ipAddress: string | null;
  /** Milliseconds since the epoch. */
  signedInAt: number;
  lastActiveAt: number;
};

const millis = (value: unknown): number => new Date(value as string | number | Date).getTime();

/**
 * The person's own open sessions, newest activity first (core-app §3.11). Only theirs, only those that
 * have not expired, and never the token, which is the secret behind the cookie: the list is shown in a
 * page, and ending a session is done by its id.
 */
export async function listSessions(
  database: Database,
  userId: string,
  currentSessionId: string,
  now: number = Date.now(),
): Promise<SessionSummary[]> {
  const { rows } = await database.run(
    'select id, user_agent, ip_address, created_at, updated_at, expires_at from sessions where user_id = ?',
    [userId],
  );
  return rows
    .filter((row) => millis(row.expires_at) > now)
    .map((row) => ({
      id: String(row.id),
      current: String(row.id) === currentSessionId,
      device: describeDevice(row.user_agent as string | null),
      ipAddress: describeAddress(row.ip_address as string | null),
      signedInAt: millis(row.created_at),
      lastActiveAt: millis(row.updated_at),
    }))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/**
 * Ends one of the person's sessions (core-app §3.11). It goes through better-auth's own endpoint, with the
 * request's own cookies, and not through the table: better-auth is what tells the apps (a logout token to
 * each one that registered a back-channel logout address) and revokes the session's access tokens
 * (core-app §3.6.5), which deleting the row does not. False when the session is not theirs, or is already
 * gone: it is never another person's, since the row is looked up by owner first.
 */
export async function endSession(
  auth: Pick<Auth, 'api'>,
  database: Database,
  userId: string,
  sessionId: string,
  headers: Headers,
): Promise<boolean> {
  const { rows } = await database.run('select token from sessions where id = ? and user_id = ?', [
    sessionId,
    userId,
  ]);
  const token = rows[0]?.token;
  if (typeof token !== 'string') return false;
  await auth.api.revokeSession({ headers, body: { token } });
  return true;
}

/**
 * Ends every session of the person's except the one the request is made from, and says how many. The same
 * route as `endSession`, so the apps are told and tokens revoked for each.
 */
export async function endOtherSessions(
  auth: Pick<Auth, 'api'>,
  database: Database,
  userId: string,
  currentSessionId: string,
  headers: Headers,
): Promise<number> {
  const { rows } = await database.run(
    'select count(*) as n from sessions where user_id = ? and id <> ?',
    [userId, currentSessionId],
  );
  const count = Number(rows[0]?.n ?? 0);
  if (count > 0) await auth.api.revokeOtherSessions({ headers });
  return count;
}
