import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import styles from './ConsentPrompt.module.css';

export interface ConsentPromptProps {
  /** The plugin requesting access. */
  consumerName: string;
  /** The plugin whose data would be read. */
  providerName: string;
  /** The named contract being requested (e.g. `"expenses"`). */
  contract: string;
  /**
   * The provider's own manifest-declared explanation of what this contract
   * exposes (`data.provides[].description`) — never caller-supplied at
   * request time, so a consuming plugin can't write its own persuasive copy
   * for what it's asking to read.
   */
  description?: string | null;
  onAllow: () => void;
  onDeny?: () => void;
  allowLabel?: string;
  denyLabel?: string;
  /** Disables both buttons and shows a busy state on Allow while a request is in flight. */
  pending?: boolean;
  className?: string;
}

/**
 * The consent screen shown before one plugin is allowed to read another
 * plugin's data (RFC 0002 §4) — the step that was previously missing between
 * a `ConsentRequiredError` and a grant actually being created. Presentational
 * only: holds no state of its own, so it renders identically wherever it's
 * used (currently Account → Data's pending-requests list).
 */
export function ConsentPrompt({
  consumerName,
  providerName,
  contract,
  description,
  onAllow,
  onDeny,
  allowLabel = 'Allow',
  denyLabel = 'Not now',
  pending = false,
  className,
}: ConsentPromptProps) {
  return (
    <Card padding="sm" className={[styles.root, className].filter(Boolean).join(' ')}>
      <p className={styles.title}>
        <strong>{consumerName}</strong> wants to read <strong>{contract}</strong> from{' '}
        <strong>{providerName}</strong>
      </p>
      {description ? <p className={styles.description}>{description}</p> : null}
      <div className={styles.actions}>
        <Button variant="primary" size="sm" onClick={onAllow} disabled={pending} loading={pending}>
          {allowLabel}
        </Button>
        {onDeny ? (
          <Button variant="ghost" size="sm" onClick={onDeny} disabled={pending}>
            {denyLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
