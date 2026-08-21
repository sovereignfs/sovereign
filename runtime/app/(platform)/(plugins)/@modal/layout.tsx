'use client';

import type { ReactNode } from 'react';
import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { Dialog } from '@sovereignfs/ui';
import { getInstalledPlugins } from '@/src/registry';
import { overlaySizeForSegment, routeSegmentFromInterception } from '@/src/overlay';

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

  const plugins = getInstalledPlugins();
  const size = overlaySizeForSegment(segment, plugins);
  const routeSegment = routeSegmentFromInterception(segment ?? '');
  const plugin = plugins.find((p) => p.routePrefix === `/${routeSegment}`);
  const title = plugin?.name;

  return (
    // showCloseButton: explicit override — Dialog's default close-button rule
    // now keys off a composed DialogHeader, which this slot doesn't render
    // (children is an entire routed plugin subtree — AccountLayout/
    // ConsoleLayout — that already renders its own inline <h1>+tabs on
    // desktop, and hands its tab strip up via useOverlaySecondRow for
    // Dialog's legacy mobile-only title bar). That per-breakpoint header
    // treatment predates DialogHeader and still needs the close button;
    // `true` preserves it without forcing a redundant second title row.
    <Dialog open onClose={() => router.back()} size={size} title={title} showCloseButton>
      {children}
    </Dialog>
  );
}
