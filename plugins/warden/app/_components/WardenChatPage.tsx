import { sdk } from '@sovereignfs/sdk';
import { ChatView } from './ChatView';
import { SetupPrompt } from './SetupPrompt';
import { listMessages, listSessions } from '../_lib/sessions';
import { resolveActiveSessionId } from '../_lib/active-session';
import { discoverModels } from '../_lib/model-discovery';
import { isModelVisible, listVisibilityOverrides } from '../_lib/model-visibility';
import { getDefaultModelKey } from '../_lib/user-settings';

/**
 * Shared render body for both of Warden's chat routes — `/warden`
 * (`?session=` selects a specific session, otherwise continues the most
 * recently active one) and `/warden/new` (always a blank composer,
 * regardless of `requestedSessionId` or how many sessions already exist).
 * Pulled out of `page.tsx` so the two routes can't drift on data-loading
 * shape; only `forceNewChat` and how each route computes
 * `requestedSessionId` differ.
 *
 * Renders the chat column only. The surrounding shell — sidebar, collapse
 * state, and the `data-plugin-fullbleed` root — belongs to
 * `app/(chat)/layout.tsx`, so navigating between these two routes swaps
 * just this subtree instead of rebuilding the whole screen.
 *
 * Shows the first-run setup prompt only when there's genuinely nothing to
 * chat with (no provider *configured* and no local model reachable) — a
 * configured-but-currently-unreachable provider still shows the ordinary
 * chat view (its model just won't appear in the picker until it's fixed),
 * since that's a degraded state the providers page addresses, not a
 * first-run one.
 */
export async function WardenChatPage({
  requestedSessionId,
  forceNewChat = false,
}: {
  requestedSessionId: string | null;
  /** `/warden/new`'s own entry point — always resolves to no active
   *  session, never falling back to the most recently active one, so the
   *  "New chat" link reliably opens a genuinely blank composer regardless
   *  of `requestedSessionId` or existing session history. A session is
   *  still only ever created lazily on the first actual send
   *  (`app/api/chat/route.ts`), matching every other entry point. */
  forceNewChat?: boolean;
}) {
  const session = await sdk.auth.requireSession();
  const discovery = await discoverModels();
  const hasAnyProviderConfigured = discovery.providers.length > 0;
  const hasAnyModel = hasAnyProviderConfigured || discovery.local.available;

  if (!hasAnyModel) return <SetupPrompt />;

  const [allSessions, visibilityOverrides, defaultModelKey] = await Promise.all([
    listSessions(session.user.id, session.user.tenantId),
    listVisibilityOverrides(session.user.id, session.user.tenantId),
    getDefaultModelKey(session.user.id, session.user.tenantId),
  ]);
  // Same rule the sidebar applies client-side — see `active-session.ts`.
  const activeSessionId = resolveActiveSessionId(
    allSessions.map((s) => s.id),
    requestedSessionId,
    forceNewChat,
  );
  const initialMessages = activeSessionId
    ? await listMessages(session.user.id, session.user.tenantId, activeSessionId)
    : [];

  const visibleModels = discovery.models.filter((model) =>
    isModelVisible(model.key, visibilityOverrides),
  );
  const allModelsHidden = discovery.models.length > 0 && visibleModels.length === 0;
  // The user's explicit Settings → General default (task 22.9), if it's
  // still a visible model — otherwise fall back to the first visible one,
  // same as before this setting existed.
  const resolvedDefaultModelKey =
    defaultModelKey && visibleModels.some((model) => model.key === defaultModelKey)
      ? defaultModelKey
      : (visibleModels[0]?.key ?? '');

  return (
    /*
      `key` is load-bearing, not cosmetic. `ChatView` seeds every piece of
      its state from these props in `useState` initializers, which only run
      on mount — and the sidebar switches sessions with
      `/warden?session=<id>`, a search-param-only navigation. Next.js builds
      a segment's React key from `createRouterCacheKey(segment, true)` —
      deliberately excluding search params — so without a key of our own
      React reuses the same fiber, the initializers never re-run, and the
      previous session's messages stay on screen while `sessionId` still
      points at the old session. The next send is then written into the
      session the user thought they had navigated away from.
    */
    <ChatView
      key={activeSessionId ?? 'new'}
      initialSessionId={activeSessionId}
      initialMessages={initialMessages}
      models={visibleModels}
      providers={discovery.providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
      }))}
      defaultModelKey={resolvedDefaultModelKey}
      allModelsHidden={allModelsHidden}
    />
  );
}
