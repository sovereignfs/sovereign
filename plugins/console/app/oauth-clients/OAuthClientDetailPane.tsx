'use client';

import Link from 'next/link';
import { Button, Icon, StatusBadge } from '@sovereignfs/ui';
import styles from '../console.module.css';

interface OAuthClientRow {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  scope?: string;
  disabled?: boolean;
}

/**
 * Desktop `ThreeColumnLayout` detail column for a selected external OAuth
 * client — relocates the Rotate/Revoke actions that used to sit inline on
 * the client's list card. Rendered via `ConsoleDetailSlot` from
 * `OAuthClientsClient`; `closeHref` drops the `?client=` param.
 *
 * Unlike legs 2-4's detail panes, there's no dialog here to "replace" —
 * every field shown (name, ID, redirect URIs, status) was already visible
 * inline on the card before this leg. This pane exists for visual
 * consistency with the other three converted pages, not because it reveals
 * previously-hidden information (workstream 0022 leg 5's own technical note
 * flagged this up front). The one genuinely one-time-only piece of
 * information — a freshly created/rotated client secret — stays exactly
 * where it already rendered (a page-level banner, not scoped to this pane),
 * since that flow and its "shown once, unrecoverable" invariant predates
 * this leg and isn't worth touching.
 */
export function OAuthClientDetailPane({
  client,
  closeHref,
  onRotate,
  onRevoke,
}: {
  client: OAuthClientRow;
  closeHref: string;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className={styles.detailPane}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeading}>
          <span className={styles.detailTitle}>{client.client_name ?? '(unnamed)'}</span>
          <span className={styles.detailSubtitle}>{client.redirect_uris.join(', ')}</span>
        </div>
        <Link
          replace
          href={closeHref}
          className={styles.iconBtn}
          aria-label="Close client detail"
          title="Close"
        >
          <Icon name="x" size="sm" aria-hidden />
        </Link>
      </div>

      <span className={styles.userId} title="Client ID">
        {client.client_id}
      </span>

      <div className={styles.detailBadges}>
        <StatusBadge status={client.disabled ? 'error' : 'synced'}>
          {client.disabled ? 'Revoked' : 'Active'}
        </StatusBadge>
      </div>

      <div className={styles.detailSection}>
        <h3 className={styles.detailSectionTitle}>Actions</h3>
        <div className={styles.rowActions}>
          <Button variant="secondary" size="sm" onClick={onRotate}>
            Rotate secret
          </Button>
          <Button variant="destructive" size="sm" onClick={onRevoke}>
            Revoke
          </Button>
        </div>
      </div>
    </div>
  );
}
