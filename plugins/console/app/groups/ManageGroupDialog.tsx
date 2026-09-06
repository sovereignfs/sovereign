'use client';

import { useState } from 'react';
import { Button, Dialog } from '@sovereignfs/ui';
import { GroupDetailFields } from './GroupDetailFields';
import styles from '../console.module.css';

interface GroupSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * Mobile-only entry point — Groups has no detail column to render into
 * there (see `groups/page.tsx`'s desktop-only chevron/selection link), so it
 * keeps a button+`Dialog` wrapper around the same `GroupDetailFields` the
 * desktop `GroupDetailPane` renders inline. Mirrors workstream 0022 leg 2's
 * `CapabilitiesButton`.
 */
export function ManageGroupDialog({ group }: { group: GroupSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* `.cardManageButton`: this button is a direct child of the Groups
          list's `.card` (a flex column, `align-items: stretch`), which would
          otherwise stretch it to the card's full width. */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={styles.cardManageButton}
        onClick={() => setOpen(true)}
      >
        Manage
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} size="md" title={`Manage "${group.name}"`}>
        {open && <GroupDetailFields group={group} />}
      </Dialog>
    </>
  );
}
