/**
 * Which session is "open", derived from the URL plus the ordered session
 * list — the single rule shared by the server (which loads that session's
 * messages) and `WardenSidebar` (which highlights the row).
 *
 * They used to be the same computation in one place, because the sidebar
 * lived inside the chat page and was handed a server-resolved
 * `activeSessionId`. Hoisting the sidebar into the route-group layout — so
 * it survives navigation between `/warden` and `/warden/new` instead of
 * being torn down and rebuilt each time — splits them across a boundary a
 * layout can't cross: layouts receive no `searchParams`, so the sidebar has
 * to read `?session=` client-side itself.
 *
 * Two independent copies of "and if there's no `?session=`, fall back to
 * the most recent one" is exactly the drift that lets the highlighted row
 * and the loaded conversation disagree, so both callers go through here.
 */
export function resolveActiveSessionId(
  /** Session ids in `listSessions()` order — most recently active first. */
  orderedSessionIds: string[],
  requestedSessionId: string | null,
  /** `/warden/new`: deliberately blank, never resuming anything. */
  forceNewChat: boolean,
): string | null {
  if (forceNewChat) return null;
  // An unrecognized id (a stale link, or another user's) falls through to
  // the same fallback as no id at all, rather than showing nothing.
  if (requestedSessionId && orderedSessionIds.includes(requestedSessionId)) {
    return requestedSessionId;
  }
  return orderedSessionIds[0] ?? null;
}

/** The `/warden/new` route — the one path that forces a blank chat. */
export const NEW_CHAT_PATHNAME = '/warden/new';

/** The sidebar's other two destinations, which render in the same main
 *  column as the chat rather than on a page of their own. */
export const PROVIDERS_PATHNAME = '/warden/providers';
export const MODELS_PATHNAME = '/warden/models';
