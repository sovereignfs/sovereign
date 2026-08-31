'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@sovereignfs/ui';
import { GRANTABLE_CAPABILITIES, type GrantableCapability } from '@/src/capabilities';
import styles from '../console.module.css';
import {
  grantCapabilityAction,
  listUserCapabilitiesAction,
  revokeCapabilityAction,
} from './actions';

const LABELS: Record<GrantableCapability, string> = {
  'plugins:self-manage': 'Self-service app enable/disable',
};

/**
 * The actual capability grant/revoke list — extracted from the former
 * `CapabilitiesButton` so it can render inline in the desktop detail pane
 * (`UserDetailPane`) without a dialog wrapper, while `CapabilitiesButton`
 * itself keeps composing this same list behind a button+`Dialog` for
 * mobile, which has no detail column to render into.
 */
export function UserCapabilitiesFields({ userId }: { userId: string }) {
  const [grants, setGrants] = useState<GrantableCapability[] | null>(null);
  const [pending, setPending] = useState<GrantableCapability | null>(null);

  const refresh = useCallback(() => {
    listUserCapabilitiesAction(userId)
      .then(setGrants)
      .catch(() => setGrants([]));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggle(cap: GrantableCapability, granted: boolean) {
    setPending(cap);
    try {
      const fd = new FormData();
      fd.set('userId', userId);
      fd.set('capability', cap);
      if (granted) {
        await revokeCapabilityAction(fd);
      } else {
        await grantCapabilityAction(fd);
      }
      refresh();
    } finally {
      setPending(null);
    }
  }

  if (grants === null) {
    return <p className={styles.textMuted}>Loading…</p>;
  }

  return (
    <ul className={styles.cards} style={{ gridTemplateColumns: '1fr', gap: 'var(--sv-space-2)' }}>
      {GRANTABLE_CAPABILITIES.map((cap) => {
        const granted = grants.includes(cap);
        return (
          <li
            key={cap}
            className={styles.card}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--sv-space-3)',
            }}
          >
            <span>{LABELS[cap]}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending === cap}
              onClick={() => toggle(cap, granted)}
            >
              {granted ? 'Revoke' : 'Grant'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
