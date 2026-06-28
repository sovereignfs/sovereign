export interface AuthUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  // better-auth's `active` boolean reads back as 0/1 on SQLite and true/false on
  // Postgres; NULL means active (the default). The route passes whichever the
  // driver returns — `buildMemberList` treats 0 and false as deactivated.
  active: number | boolean | null;
  // Reads back as 0/1 on SQLite, true/false on Postgres. Absent on rows from
  // instances that haven't run the auth migration yet — treated as false.
  isTestUser?: number | boolean | null;
  createdAt: string; // normalised to an ISO 8601 string by the caller (Date on pg)
}

export interface PendingInviteRow {
  email: string;
  created_at: number; // Unix timestamp (seconds) — caller normalises pg bigint strings
  expires_at: number | null;
}

export interface MemberRow {
  id: string | null;
  email: string;
  name: string | null;
  role: string | null;
  status: 'active' | 'deactivated' | 'invited';
  isTestUser?: boolean;
  createdAt: string;
  expiresAt: string | null;
}

/**
 * Merge registered users and pending invites into the unified member list the
 * Console users table renders. Invites for already-registered emails are
 * dropped; multiple invites to the same address are deduplicated keeping the
 * most recent (callers pass invites ordered by created_at ascending, so last
 * write wins). Expiry filtering (consumed/expired invites) is the caller's
 * responsibility — this function assumes `invites` are already pending.
 */
export function buildMemberList(users: AuthUserRow[], invites: PendingInviteRow[]): MemberRow[] {
  const registeredEmails = new Set(users.map((u) => u.email));

  const inviteByEmail = new Map<string, PendingInviteRow>();
  for (const inv of invites) {
    if (!registeredEmails.has(inv.email)) {
      inviteByEmail.set(inv.email, inv); // last write wins = most recent
    }
  }

  const userRows: MemberRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.active === 0 || u.active === false ? 'deactivated' : 'active',
    isTestUser: u.isTestUser === 1 || u.isTestUser === true,
    createdAt: u.createdAt,
    expiresAt: null,
  }));

  const inviteRows: MemberRow[] = Array.from(inviteByEmail.values()).map((inv) => ({
    id: null,
    email: inv.email,
    name: null,
    role: null,
    status: 'invited',
    isTestUser: false,
    createdAt: new Date(inv.created_at * 1000).toISOString(),
    expiresAt: inv.expires_at ? new Date(inv.expires_at * 1000).toISOString() : null,
  }));

  return [...userRows, ...inviteRows];
}
