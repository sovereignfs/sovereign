'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Dialog } from '@sovereignfs/ui';
import { GRANTABLE_CAPABILITIES, type GrantableCapability } from '@/src/capabilities';
import styles from '../console.module.css';
import {
  grantCapabilityAction,
  listUserCapabilitiesAction,
  revokeCapabilityAction,
} from './actions';

const LABELS: Record<GrantableCapability, string> = {
  'plugins:self-manage': 'Self-service plugin enable/disable',
};

export function CapabilitiesButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [grants, setGrants] = useState<GrantableCapability[] | null>(null);
  const [pending, setPending] = useState<GrantableCapability | null>(null);

  const refresh = useCallback(() => {
    listUserCapabilitiesAction(userId)
      .then(setGrants)
      .catch(() => setGrants([]));
  }, [userId]);

  useEffect(() => {
    if (open) refresh();
    else setGrants(null);
  }, [open, refresh]);

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

  return (
    <>
      <button
        type="button"
        className={styles.iconBtn}
        title="Manage capabilities"
        onClick={() => setOpen(true)}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" />
        </svg>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Capabilities for ${name}`}
      >
        <p className={styles.lede}>
          Grant this user one additional capability their role preset doesn&apos;t include. This
          does not change their role.
        </p>
        {grants === null ? (
          <p className={styles.textMuted}>Loading…</p>
        ) : (
          <ul
            className={styles.cards}
            style={{ gridTemplateColumns: '1fr', gap: 'var(--sv-space-2)' }}
          >
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
        )}
      </Dialog>
    </>
  );
}
