import Link from 'next/link';
import { Button, EmptyState } from '@sovereignfs/ui';
import styles from '../warden.module.css';

/**
 * First-run empty state (RFC 0063 §4, epic task 22.4) — shown instead of the
 * ordinary chat view only when there's genuinely nothing to chat with yet
 * (no provider configured *and* no local model reachable). A provider that's
 * merely unreachable/erroring doesn't fall back here — that's an ordinary
 * degraded state the providers page itself surfaces, not a first-run state.
 */
export function SetupPrompt() {
  return (
    <div className={styles.emptyState}>
      <EmptyState
        icon="link"
        heading="Set up Warden"
        description="Add a model provider to start chatting — any OpenAI-compatible endpoint, or your own self-hosted server."
        action={
          <Link href="/warden/providers">
            <Button>Add a provider</Button>
          </Link>
        }
      />
    </div>
  );
}
