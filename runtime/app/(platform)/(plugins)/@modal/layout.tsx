'use client';

import type { ReactNode } from 'react';
import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { Dialog } from '@sovereignfs/ui';

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
 * on top of the previous page in history, so going back restores it intact.
 */
export default function ModalSlotLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();
  const open = segment !== null && segment !== '__DEFAULT__';

  if (!open) return <>{children}</>;

  return (
    <Dialog open onClose={() => router.back()} size="lg" aria-label="Overlay">
      {children}
    </Dialog>
  );
}
