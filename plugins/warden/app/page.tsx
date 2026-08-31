import { sdk } from '@sovereignfs/sdk';
import { ChatView } from './_components/ChatView';
import { SetupPrompt } from './_components/SetupPrompt';
import { WardenLayoutShell } from './_components/WardenLayoutShell';
import { WardenSidebar } from './_components/WardenSidebar';
import { SIDEBAR_RECENT_LIMIT, listMessages, listSessions } from './_lib/sessions';
import { discoverModels } from './_lib/model-discovery';
import { isModelVisible, listVisibilityOverrides } from './_lib/model-visibility';
import { getDefaultModelKey } from './_lib/user-settings';
import styles from './warden.module.css';

/**
 * Warden's routed chat page (RFC 0063, epic tasks 22.3-22.10).
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
 *
 * The active session is driven entirely by the `?session=` query param
 * (`WardenSidebar`'s row links, and `ChatView`'s own `router.replace` once a
 * brand-new session's id comes back from `POST /api/chat`) — so the
 * sidebar's list and the composer's open session are always reading the
 * same server-resolved value and can never disagree about which session is
 * "open". An unrecognized/foreign `?session=` value (stale link, another
 * user's id) falls back to the most recent session, same as having no
 * session at all.
 */
export default async function WardenPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session: requestedSessionId } = await searchParams;
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
  const activeSession =
    (requestedSessionId && allSessions.find((s) => s.id === requestedSessionId)) ||
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
          defaultModelKey={resolvedDefaultModelKey}
          allModelsHidden={allModelsHidden}
        />
      </WardenLayoutShell>
    </div>
  );
}
