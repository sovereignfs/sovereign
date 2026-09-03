'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@sovereignfs/ui';
import styles from '../inbox.module.css';

export function MessageDetailActions({
  id,
  readAt,
  archivedAt,
}: {
  id: string;
  readAt: number | null;
  archivedAt: number | null;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function post(action: 'unread' | 'archive' | 'unarchive' | 'delete'): Promise<void> {
    setWorking(true);
    await fetch(`/api/inbox/messages/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setWorking(false);
    if (action === 'delete') {
      router.replace('/inbox?tab=messages');
      return;
    }
    router.refresh();
  }

  if (confirmingDelete) {
    return (
      <div className={styles.detailActions}>
        <span className={styles.help}>Delete this message? This cannot be undone.</span>
        <Button variant="destructive" disabled={working} onClick={() => void post('delete')}>
          Delete
        </Button>
        <Button variant="secondary" disabled={working} onClick={() => setConfirmingDelete(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.detailActions}>
      {readAt && (
        <Button variant="secondary" disabled={working} onClick={() => void post('unread')}>
          Mark as unread
        </Button>
      )}
      {archivedAt ? (
        <Button variant="secondary" disabled={working} onClick={() => void post('unarchive')}>
          Unarchive
        </Button>
      ) : (
        <Button variant="secondary" disabled={working} onClick={() => void post('archive')}>
          Archive
        </Button>
      )}
      <Button variant="destructive" disabled={working} onClick={() => setConfirmingDelete(true)}>
        Delete
      </Button>
    </div>
  );
}
