'use client';

import { Badge, Button } from '@sovereignfs/ui';
import { DetailIdRow, DetailPaneHeader, DetailSection } from '../_components/DetailPaneHeader';
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
 * `OAuthClientsClient`; `closeHref` drops the `?client=` param. Both actions
 * confirm before running (the parent owns the dialogs).
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
      <DetailPaneHeader
        title={client.client_name ?? 'Unnamed client'}
        subtitle={client.redirect_uris.join(', ')}
        closeHref={closeHref}
        closeLabel="Close client detail"
      />

      <DetailIdRow value={client.client_id} label="Copy client ID" />

      <div className={styles.detailBadges}>
        {client.disabled ? (
          <Badge variant="status" size="sm" status="deactivated">
            Revoked
          </Badge>
        ) : (
          <Badge variant="status" size="sm" status="active">
            Active
          </Badge>
        )}
      </div>

      <DetailSection title="Actions">
        <div className={styles.rowActions}>
          <Button variant="secondary" size="sm" onClick={onRotate}>
            Rotate secret
          </Button>
          <Button variant="destructive" size="sm" onClick={onRevoke} disabled={client.disabled}>
            Revoke
          </Button>
        </div>
      </DetailSection>
    </div>
  );
}
