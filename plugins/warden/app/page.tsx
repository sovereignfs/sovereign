import { ChatView } from './_components/ChatView';
import { SetupPrompt } from './_components/SetupPrompt';
import { discoverModels } from './_lib/model-discovery';
import { listProviders } from './_lib/providers';
import styles from './warden.module.css';

/**
 * Warden's routed chat page (RFC 0063, epic tasks 22.3-22.4).
 * `data-plugin-fullbleed` opts into the shell's hard-locked viewport height +
 * zero padding (`runtime/app/(platform)/shell.module.css`) so `ChatView`'s
 * own internal `MessageScroller` can rely on `height: 100%` cascading
 * correctly instead of the whole document scrolling as one unit —
 * `SetupPrompt`'s own centering works the same way under fullbleed.
 *
 * Shows the first-run setup prompt only when there's genuinely nothing to
 * chat with (no provider configured *and* no local model reachable) — a
 * configured-but-currently-unreachable provider still shows the ordinary
 * chat view, since that's a degraded state the providers page addresses,
 * not a first-run one.
 */
export default async function WardenPage() {
  const [providers, discovery] = await Promise.all([listProviders(), discoverModels()]);
  const hasAnyModel = providers.length > 0 || discovery.local.available;

  return (
    <div className={styles.page} data-plugin-fullbleed>
      {hasAnyModel ? <ChatView /> : <SetupPrompt />}
    </div>
  );
}
