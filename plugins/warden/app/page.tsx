import { sdk } from '@sovereignfs/sdk';
import { ChatView } from './_components/ChatView';
import { SetupPrompt } from './_components/SetupPrompt';
import { getMostRecentSession, listMessages } from './_lib/sessions';
import { discoverModels } from './_lib/model-discovery';
import { isModelVisible, listVisibilityOverrides } from './_lib/model-visibility';
import styles from './warden.module.css';

/**
 * Warden's routed chat page (RFC 0063, epic tasks 22.3-22.8).
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
 * No sidebar yet (task 22.10 ships one) — this page auto-selects the user's
 * most recently active session, or `null` for a brand-new user with none
 * yet, keeping today's single-thread "continue where you left off" UX
 * working end to end against the now-genuinely-multi-session backend.
 */
export default async function WardenPage() {
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

  const [mostRecentSession, visibilityOverrides] = await Promise.all([
    getMostRecentSession(session.user.id, session.user.tenantId),
    listVisibilityOverrides(session.user.id, session.user.tenantId),
  ]);
  const initialMessages = mostRecentSession
    ? await listMessages(session.user.id, session.user.tenantId, mostRecentSession.id)
    : [];
  const visibleModels = discovery.models.filter((model) =>
    isModelVisible(model.key, visibilityOverrides),
  );
  const allModelsHidden = discovery.models.length > 0 && visibleModels.length === 0;

  return (
    <div className={styles.page} data-plugin-fullbleed>
      <ChatView
        initialSessionId={mostRecentSession?.id ?? null}
        initialMessages={initialMessages}
        models={visibleModels}
        defaultModelKey={visibleModels[0]?.key ?? ''}
        allModelsHidden={allModelsHidden}
      />
    </div>
  );
}
