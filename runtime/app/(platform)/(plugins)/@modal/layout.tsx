'use client';

import type { ReactNode } from 'react';
import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { Dialog } from '@sovereignfs/ui';
import { getInstalledPlugins } from '@/src/registry';
import { overlaySizeForSegment } from '@/src/overlay';

/**
 * Dialog chrome for overlay-shell plugins (RFC 0001). The generate script
 * composes each `shell: overlay` plugin's interception copy as a sibling under
 * this slot (`@modal/(.)<routePrefix>/`), so a soft navigation to the plugin
 * renders here, layered over the current page.
 *
 * A slot layout also wraps the slot's `default.tsx` fallback (active on every
 * non-overlay page and on hard navigation), so the Dialog is gated on the
 * selected segment: `useSelectedLayoutSegment()` is null / `__DEFAULT__` when
 * the slot shows its default and the intercepted segment otherwise. We always
 * return a valid element (never null) so the router tree stays intact.
 *
 * Dismissal is `router.back()`: the soft navigation that opened the overlay sits
 * on top of the previous page in history, so going back restores it intact. For
 * this to dismiss in a single step, the plugin's own intra-overlay navigation
 * (tab switches) must use `replace`, not `push` — otherwise each tab adds a
 * history entry and `router.back()` only unwinds one of them.
 *
 * The dialog size comes from the plugin's manifest `overlaySize` (resolved from
 * the selected interception segment), defaulting to `lg`.
 */
export default function ModalSlotLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();
  const open = segment !== null && segment !== '__DEFAULT__';

  if (!open) return <>{children}</>;

  const size = overlaySizeForSegment(segment, getInstalledPlugins());

  return (
    <Dialog open onClose={() => router.back()} size={size} aria-label="Overlay">
      {children}
    </Dialog>
  );
}
