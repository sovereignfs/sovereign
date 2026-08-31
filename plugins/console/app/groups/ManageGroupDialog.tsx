'use client';

import { useState } from 'react';
import { Button, Dialog } from '@sovereignfs/ui';
import { GroupDetailFields } from './GroupDetailFields';

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
      {/* alignSelf: this button is a direct child of the Groups list's
          `.card` (a flex column with the shared default `align-items:
          stretch`), which would otherwise stretch it to the card's full
          width — `.card` is also used for plain text tiles elsewhere
          (Console home, Health), so the fix is scoped to this button
          rather than changing that shared class. */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        style={{ alignSelf: 'flex-start', marginTop: 'auto' }}
      >
        Manage
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} size="md" title={`Manage "${group.name}"`}>
        {open && <GroupDetailFields group={group} />}
      </Dialog>
    </>
  );
}
