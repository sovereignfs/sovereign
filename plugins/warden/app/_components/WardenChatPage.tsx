import { sdk } from '@sovereignfs/sdk';
import { ChatView } from './ChatView';
import { SetupPrompt } from './SetupPrompt';
import { WardenLayoutShell } from './WardenLayoutShell';
import { WardenSidebar } from './WardenSidebar';
import { SIDEBAR_RECENT_LIMIT, listMessages, listSessions } from '../_lib/sessions';
import { discoverModels } from '../_lib/model-discovery';
import { isModelVisible, listVisibilityOverrides } from '../_lib/model-visibility';
import { getDefaultModelKey } from '../_lib/user-settings';
import styles from '../warden.module.css';

/**
 * Shared render body for both of Warden's chat routes — `/warden`
 * (`?session=` selects a specific session, otherwise continues the most
 * recently active one) and `/warden/new` (always a blank composer,
 * regardless of `requestedSessionId` or how many sessions already exist).
 * Pulled out of `page.tsx` so the two routes can't drift on data-loading
 * shape; only `forceNewChat` and how each route computes
 * `requestedSessionId` differ.
 *
 * `data-plugin-fullbleed` opts into the shell's hard-locked viewport height +
 * zero padding (`runtime/app/(platform)/shell.module.css`) so `ChatView`'s
 * own internal `MessageScroller` can rely on `height: 100%` cascading
 * correctly instead of the whole document scrolling as one unit —
 * `SetupPrompt`'s own centering works the same way under fullbleed.
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

  if (!hasAnyModel) {
    return (
      <div className={styles.page} data-plugin-fullbleed>
        <SetupPrompt />
      </div>
    );
  }

  const [allSessions, visibilityOverrides, defaultModelKey] = await Promise.all([
    listSessions(session.user.id, session.user.tenantId),
    listVisibilityOverrides(session.user.id, session.user.tenantId),
    getDefaultModelKey(session.user.id, session.user.tenantId),
  ]);
  const activeSession = forceNewChat
    ? null
    : (requestedSessionId && allSessions.find((s) => s.id === requestedSessionId)) ||
      allSessions[0] ||
      null;
  const initialMessages = activeSession
    ? await listMessages(session.user.id, session.user.tenantId, activeSession.id)
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

  const pinnedSessions = allSessions
    .filter((s) => s.pinnedAt !== null)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  const recentSessions = allSessions
    .filter((s) => s.pinnedAt === null)
    .slice(0, SIDEBAR_RECENT_LIMIT);

  return (
    <div className={styles.page} data-plugin-fullbleed>
      <WardenLayoutShell
        sidebar={
          <WardenSidebar
            pinnedSessions={pinnedSessions}
            recentSessions={recentSessions}
            activeSessionId={activeSession?.id ?? null}
          />
        }
      >
        <ChatView
          initialSessionId={activeSession?.id ?? null}
          initialMessages={initialMessages}
          models={visibleModels}
          providers={discovery.providers.map((provider) => ({
            id: provider.id,
            label: provider.label,
          }))}
          defaultModelKey={resolvedDefaultModelKey}
          allModelsHidden={allModelsHidden}
        />
      </WardenLayoutShell>
    </div>
  );
}
