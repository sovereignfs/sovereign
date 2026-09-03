import { WardenChatPage } from '../_components/WardenChatPage';

/**
 * Warden's dedicated "always blank" entry point — distinct from plain
 * `/warden`, which continues the most recently active session when no
 * `?session=` is given. `WardenSidebar`'s "New chat" nav item links here
 * rather than to `/warden`, so it reliably opens a fresh composer instead
 * of just returning to whatever conversation happens to be most recent. No
 * session is created by visiting this route — that still only happens
 * lazily on the first actual send (`app/api/chat/route.ts`), same as every
 * other entry point; sending a message from here hands the URL off to
 * `/warden?session=<id>` via `ChatView`'s existing `router.replace`.
 */
export default async function WardenNewChatPage() {
  return <WardenChatPage requestedSessionId={null} forceNewChat />;
}
