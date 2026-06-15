import { headers } from 'next/headers';
import { DEFAULT_TENANT_ID } from '@sovereignfs/db';
import { NotAuthenticatedError } from './errors';
import { markCurrentSessions, type RawSession } from './sessions';
import type { ActiveSession, ChangePasswordInput, Session } from './types';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

/** Returns the current user session from runtime-injected headers, or null if unauthenticated. */
export async function getSession(): Promise<Session | null> {
  const h = await headers();
  const id = h.get('x-sovereign-user-id');
  if (!id) return null;
  return {
    user: {
      id,
      // v1 is single-tenant, so every session belongs to the default tenant.
      // Multi-tenant deployments will source this from the verified session.
      tenantId: DEFAULT_TENANT_ID,
      email: h.get('x-sovereign-user-email') ?? '',
      name: h.get('x-sovereign-user-name') ?? null,
      image: h.get('x-sovereign-user-image') ?? null,
      role: h.get('x-sovereign-user-role') ?? 'platform:user',
    },
    expiresAt: Number(h.get('x-sovereign-session-expires-at') ?? 0),
  };
}

/** Returns the current user session, throwing `NotAuthenticatedError` if unauthenticated. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new NotAuthenticatedError();
  return session;
}

/**
 * Call a better-auth endpoint server-side, forwarding the caller's session
 * cookie. better-auth enforces a CSRF Origin check on state-changing routes,
 * so we send its own base URL as the trusted Origin.
 */
async function authFetch(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
  const cookie = (await headers()).get('cookie') ?? '';
  // No explicit `cache` option: under Next 15 fetch is uncached by default, so
  // these credentialed calls are never cached — and the SDK stays free of
  // Next-specific RequestInit fields so it type-checks standalone.
  return fetch(`${AUTH_URL}${path}`, {
    method,
    headers: {
      cookie,
      origin: AUTH_URL,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Build an error message including better-auth's response body, for diagnosis. */
async function authError(res: Response, action: string): Promise<Error> {
  const body = await res.text().catch(() => '');
  const detail = body ? ` — ${body}` : '';
  return new Error(`${action} (${String(res.status)})${detail}`);
}

/**
 * Change the current user's password (SRS ACC-04). Requires the current
 * password; the current session is preserved (other sessions are kept too).
 * Throws with better-auth's message on failure (e.g. wrong current password).
 */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const res = await authFetch('/api/auth/change-password', 'POST', {
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
    revokeOtherSessions: false,
  });
  if (!res.ok) {
    const message = ((await res.json().catch(() => null)) as { message?: string } | null)?.message;
    throw new Error(message ?? `Failed to change password (${String(res.status)}).`);
  }
}

/** List the current user's active sessions, current one first (SRS ACC-05). */
export async function listSessions(): Promise<ActiveSession[]> {
  const [listRes, sessionRes] = await Promise.all([
    authFetch('/api/auth/list-sessions', 'GET'),
    authFetch('/api/auth/get-session', 'GET'),
  ]);
  if (!listRes.ok) {
    throw await authError(listRes, 'Failed to list sessions');
  }
  const raw = (await listRes.json()) as RawSession[];
  const currentToken = sessionRes.ok
    ? (((await sessionRes.json()) as { session?: { token?: string } } | null)?.session?.token ??
      null)
    : null;
  return markCurrentSessions(raw, currentToken);
}

/** Revoke a session by its token (SRS ACC-06). */
export async function revokeSession(token: string): Promise<void> {
  const res = await authFetch('/api/auth/revoke-session', 'POST', { token });
  if (!res.ok) {
    throw await authError(res, 'Failed to revoke session');
  }
}

/**
 * Sign the current user out (SRS AUTH-02): ends the active session on the auth
 * server. The caller is responsible for clearing the runtime's `session_data`
 * cache cookies and redirecting — the platform's logout route does both.
 */
export async function signOut(): Promise<void> {
  // Pass an empty body so `authFetch` sends `Content-Type: application/json` —
  // better-auth's sign-out rejects requests without it (415).
  const res = await authFetch('/api/auth/sign-out', 'POST', {});
  if (!res.ok) {
    throw await authError(res, 'Failed to sign out');
  }
}
