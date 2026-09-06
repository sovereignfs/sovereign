/**
 * Where the sidebar's collapsed/expanded preference lives, shared by the
 * server (`app/(chat)/layout.tsx`, which reads it to render the right state
 * on the first paint) and the client (`WardenLayoutShell`, which writes it
 * on toggle). Zero imports so the client component can import it directly.
 *
 * A cookie rather than `localStorage` on purpose. The preference used to be
 * read in a `useEffect` after hydration, so every full load for a user who
 * keeps the sidebar open first painted the chat full-width and then jumped
 * to make room for it. Only the server can render the correct state up
 * front, and a cookie is the only client-set preference the server can see.
 *
 * Absent cookie = collapsed (a first-time visitor gets the full-width chat,
 * not a sidebar they didn't ask for); `'0'` is the one value meaning
 * expanded. Scoped to `/warden` — no other route reads it.
 */
export const SIDEBAR_COOKIE_NAME = 'warden_sidebar';
export const SIDEBAR_COOKIE_PATH = '/warden';
/** One year, in seconds — a preference, not a session. */
export const SIDEBAR_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** The `localStorage` key the preference lived under before it became a
 *  cookie; read once to carry an existing user's choice across. */
export const LEGACY_SIDEBAR_STORAGE_KEY = 'warden:sidebarCollapsed';

export function isSidebarCollapsed(cookieValue: string | undefined): boolean {
  return cookieValue !== '0';
}

/** The `Set-Cookie`-style string for `document.cookie`. */
export function sidebarCookieString(collapsed: boolean, secure: boolean): string {
  const parts = [
    `${SIDEBAR_COOKIE_NAME}=${collapsed ? '1' : '0'}`,
    `Path=${SIDEBAR_COOKIE_PATH}`,
    `Max-Age=${SIDEBAR_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
