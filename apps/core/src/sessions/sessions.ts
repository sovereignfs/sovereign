import type { Database } from '@sovereignfs/database';
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

/** Ends one of the person's sessions. False when it is not theirs, or is already gone: it is never another person's. */
export async function endSession(
  database: Database,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const { rowsAffected } = await database.run('delete from sessions where id = ? and user_id = ?', [
    sessionId,
    userId,
  ]);
  return rowsAffected > 0;
}

/** Ends every session of the person's except the one in use, and says how many. */
export async function endOtherSessions(
  database: Database,
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const { rowsAffected } = await database.run(
    'delete from sessions where user_id = ? and id <> ?',
    [userId, currentSessionId],
  );
  return rowsAffected;
}
