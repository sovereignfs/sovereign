import { WardenChatPage } from '../_components/WardenChatPage';

/**
 * Warden's routed chat page (RFC 0063, epic tasks 22.3-22.10).
 *
 * The active session is driven entirely by the `?session=` query param
 * (`WardenSidebar`'s row links, and `ChatView`'s own `router.replace` once a
 * brand-new session's id comes back from `POST /api/chat`) — so the
 * sidebar's list and the composer's open session are always reading the
 * same server-resolved value and can never disagree about which session is
 * "open". An unrecognized/foreign `?session=` value (stale link, another
 * user's id) falls back to the most recent session, same as having no
 * session at all. `/warden/new` is the dedicated "always blank" entry point
 * — this route intentionally still falls back to the most recent session
 * with no `?session=` present, so a returning user's bookmark/history entry
 * for plain `/warden` keeps landing them back where they left off.
 */
export default async function WardenPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session: requestedSessionId } = await searchParams;
  return <WardenChatPage requestedSessionId={requestedSessionId ?? null} />;
}
