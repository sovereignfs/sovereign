import { authGet, authRun } from './db';

/**
 * Progressive verification (RFC 0035). Level ladder:
 *   0 registered · 1 email_verified · 2 mfa_enrolled · 3 admin_vouched
 *
 * `verificationLevel`/`verificationEvents` live as additionalFields on
 * better-auth's own `"user"` table (the auth database), not `packages/db`'s
 * platform `users` table — apps/auth deliberately doesn't depend on
 * `@sovereignfs/db` (see ./db.ts), and RFC 0035 §5.2 places these columns on
 * the auth side. `verificationEvents` is a JSON-encoded array capped at
 * MAX_EVENTS, append-only, oldest dropped first — an audit trail, not a
 * queryable log.
 */

export type VerificationEventType =
  'email_verified' | 'mfa_enrolled' | 'mfa_removed' | 'vouched' | 'vouch_revoked';

export interface VerificationEvent {
  type: VerificationEventType;
  at: number; // unix seconds
  /** Admin user id, present only for vouched/vouch_revoked events. */
  by?: string;
}

const MAX_EVENTS = 20;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function parseEvents(raw: string | null | undefined): VerificationEvent[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VerificationEvent[]) : [];
  } catch {
    return [];
  }
}

/** Append an event to the JSON-encoded log, capped at MAX_EVENTS (oldest dropped first). */
export function appendVerificationEvent(
  raw: string | null | undefined,
  event: VerificationEvent,
): string {
  const events = [...parseEvents(raw), event];
  return JSON.stringify(events.slice(-MAX_EVENTS));
}

/** Row shape read off the post-write `user` object better-auth hooks receive. */
export interface VerificationSignals {
  emailVerified: boolean;
  hasMfa: boolean;
}

export interface RecomputeResult {
  level: 0 | 1 | 2 | 3;
  events: string | null | undefined;
  changed: boolean;
}

/**
 * Pure decision function behind `recomputeVerificationLevel` — kept
 * DB-free and directly unit-testable, mirroring this file's `resolveInviteOnly`-
 * style split elsewhere in apps/auth (pure logic tested directly, the thin
 * DB-touching wrapper left to integration coverage).
 *
 * Self-healing recompute: derive the level from the user's *current*
 * email/MFA signals rather than diffing which field just changed — better-
 * auth's `databaseHooks.user.update.after` hands us only the post-write row,
 * with no automatic before/after diff (confirmed against the installed
 * `@better-auth/core@1.6.25` types). Promotion only ever raises 0→1 (email)
 * or <2→2 (MFA); MFA removal unconditionally drops to `min(level, 1)` per
 * RFC 0035 §5.4 — this also revokes an admin-vouched Level 3, a deliberate
 * RFC choice (vouch assumes MFA stays enrolled), not an oversight.
 */
export function computeVerificationRecompute(
  currentLevel: number,
  currentEvents: string | null | undefined,
  signals: VerificationSignals,
  now: number = nowSeconds(),
): RecomputeResult {
  let level = currentLevel;
  let events = currentEvents;

  if (signals.emailVerified && level < 1) {
    level = 1;
    events = appendVerificationEvent(events, { type: 'email_verified', at: now });
  }
  if (signals.hasMfa && level < 2) {
    level = 2;
    events = appendVerificationEvent(events, { type: 'mfa_enrolled', at: now });
  }
  if (!signals.hasMfa && level > 1) {
    level = 1;
    events = appendVerificationEvent(events, { type: 'mfa_removed', at: now });
  }

  return {
    level: level as 0 | 1 | 2 | 3,
    events,
    changed: level !== currentLevel || events !== currentEvents,
  };
}

/**
 * No-ops (no query) when the recomputed level already matches — see
 * `computeVerificationRecompute` for the decision logic.
 */
export async function recomputeVerificationLevel(
  userId: string,
  currentLevel: number,
  currentEvents: string | null | undefined,
  signals: VerificationSignals,
): Promise<void> {
  const result = computeVerificationRecompute(currentLevel, currentEvents, signals);
  if (!result.changed) return;
  await authRun(
    'UPDATE "user" SET "verificationLevel" = ?, "verificationEvents" = ?, "updatedAt" = ? WHERE id = ?',
    [result.level, result.events, new Date().toISOString(), userId],
  );
}

/** Whether a user has at least one usable MFA method enrolled (TOTP or passkey). */
export async function userHasMfa(userId: string, twoFactorEnabled: boolean): Promise<boolean> {
  if (twoFactorEnabled) return true;
  const row = await authGet<{ c: number | string }>(
    'SELECT COUNT(*) AS c FROM "passkey" WHERE "userId" = ?',
    [userId],
  );
  return Number(row?.c ?? 0) > 0;
}

/**
 * Directly set a user's verification level and append an event — used by the
 * admin vouch/revoke-vouch route, which isn't driven by a better-auth hook.
 */
export async function setVerificationLevel(
  userId: string,
  level: 0 | 1 | 2 | 3,
  event: VerificationEvent,
): Promise<void> {
  const row = await authGet<{ verificationEvents: string | null }>(
    'SELECT "verificationEvents" FROM "user" WHERE id = ?',
    [userId],
  );
  const events = appendVerificationEvent(row?.verificationEvents, event);
  await authRun(
    'UPDATE "user" SET "verificationLevel" = ?, "verificationEvents" = ?, "updatedAt" = ? WHERE id = ?',
    [level, events, new Date().toISOString(), userId],
  );
}
