import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { authAll } from '@/src/db';
import { buildMemberList, type AuthUserRow, type PendingInviteRow } from '@/src/member-list';

/** Normalise a better-auth date (ISO string on SQLite, Date on Postgres) to ISO. */
function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  // Quote the `user` table (reserved word in Postgres) and camelCase columns so
  // the query is portable across SQLite and Postgres.
  const userRows = await authAll<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    active: number | boolean | null;
    isTestUser?: number | boolean | null;
    verificationLevel?: number | string | null;
    createdAt: string | Date;
  }>(
    'SELECT id, email, name, role, active, "isTestUser", "verificationLevel", "createdAt" FROM "user" ORDER BY "createdAt" ASC',
  );
  // A session row is only ever created on a successful sign-in — its own
  // `createdAt` (not `updatedAt`, which also moves on plain session-refresh
  // activity) is the accurate "last login" instant. GROUP BY + MAX is
  // portable across SQLite and Postgres; users with no session row at all
  // (created by seed/admin, never signed in) simply have no entry in the map.
  const lastLoginRows = await authAll<{ userId: string; lastLoginAt: string | Date }>(
    'SELECT "userId", MAX("createdAt") AS "lastLoginAt" FROM session GROUP BY "userId"',
  );
  const lastLoginByUserId = new Map(lastLoginRows.map((r) => [r.userId, toIso(r.lastLoginAt)]));

  const users: AuthUserRow[] = userRows.map((u) => ({
    ...u,
    createdAt: toIso(u.createdAt),
    lastLoginAt: lastLoginByUserId.get(u.id) ?? null,
  }));

  const now = Math.floor(Date.now() / 1000);

  // Pending invites only: not consumed, not expired. Ascending order so the
  // merge's last-write-wins dedup keeps the most recent invite per email.
  const inviteRows = await authAll<{
    email: string;
    created_at: number | string;
    expires_at: number | string | null;
  }>(
    `SELECT email, created_at, expires_at FROM invites
       WHERE consumed_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at ASC`,
    [now],
  );
  // created_at/expires_at are BIGINT on Postgres, returned as strings — coerce.
  const invites: PendingInviteRow[] = inviteRows.map((i) => ({
    email: i.email,
    created_at: Number(i.created_at),
    expires_at: i.expires_at == null ? null : Number(i.expires_at),
  }));

  return NextResponse.json(buildMemberList(users, invites));
}
