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
  // 0-3 (RFC 0035). Absent on rows from instances that haven't run this
  // leg's migration yet — treated as 0 (registered, the column's own default).
  verificationLevel?: number | string | null;
  createdAt: string; // normalised to an ISO 8601 string by the caller (Date on pg)
  // ISO 8601 string, or null if the user has never had a session (e.g.
  // created by seed/admin but never actually signed in). Derived by the
  // caller from `MAX(session.createdAt)` grouped by userId — a session is
  // only ever created on a successful sign-in, so its `createdAt` (not
  // `updatedAt`, which also moves on plain session-refresh activity) is the
  // accurate "last login" instant.
  lastLoginAt: string | null;
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
  verificationLevel: 0 | 1 | 2 | 3;
  createdAt: string;
  expiresAt: string | null;
  lastLoginAt: string | null;
}

/** Clamp a raw DB value (number, bigint-as-string on pg, or absent) to 0-3. */
function normalizeVerificationLevel(raw: number | string | null | undefined): 0 | 1 | 2 | 3 {
  const n = Number(raw ?? 0);
  if (n >= 3) return 3;
  if (n === 2) return 2;
  if (n === 1) return 1;
  return 0;
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
    verificationLevel: normalizeVerificationLevel(u.verificationLevel),
    createdAt: u.createdAt,
    expiresAt: null,
    lastLoginAt: u.lastLoginAt,
  }));

  const inviteRows: MemberRow[] = Array.from(inviteByEmail.values()).map((inv) => ({
    id: null,
    email: inv.email,
    name: null,
    role: null,
    status: 'invited',
    isTestUser: false,
    verificationLevel: 0,
    createdAt: new Date(inv.created_at * 1000).toISOString(),
    expiresAt: inv.expires_at ? new Date(inv.expires_at * 1000).toISOString() : null,
    lastLoginAt: null,
  }));

  return [...userRows, ...inviteRows];
}
