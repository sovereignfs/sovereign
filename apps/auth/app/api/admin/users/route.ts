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
    isTestUser: number | boolean | null;
    createdAt: string | Date;
  }>(
    'SELECT id, email, name, role, active, "isTestUser", "createdAt" FROM "user" ORDER BY "createdAt" ASC',
  );
  const users: AuthUserRow[] = userRows.map((u) => ({ ...u, createdAt: toIso(u.createdAt) }));

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
