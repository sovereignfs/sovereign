'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@sovereignfs/ui';
import styles from '../inbox.module.css';

export function NotificationDetailActions({
  id,
  readAt,
  actionUrl,
}: {
  id: string;
  readAt: number | null;
  actionUrl: string | null;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function post(action: 'read' | 'dismiss'): Promise<void> {
    setWorking(true);
    await fetch('/api/account/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    });
    setWorking(false);
    router.refresh();
  }

  return (
    <div className={styles.detailActions}>
      {actionUrl && <Button onClick={() => router.push(actionUrl)}>Open</Button>}
      {!readAt && (
        <Button variant="secondary" disabled={working} onClick={() => void post('read')}>
          Mark as read
        </Button>
      )}
      <Button variant="secondary" disabled={working} onClick={() => void post('dismiss')}>
        Dismiss
      </Button>
    </div>
  );
}
