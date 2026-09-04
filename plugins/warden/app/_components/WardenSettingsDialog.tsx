'use client';

import { Dialog } from '@sovereignfs/ui';
import type { DiscoveredModel } from '../_lib/model-discovery';
import { GeneralSettings } from './GeneralSettings';

/**
 * Warden's General settings, in a dialog rather than a page.
 *
 * What's left here after Providers and Models became their own destinations
 * in the main column is small and self-contained — a default model, a
 * retention action, and a link to the account-wide export. A whole route
 * for that meant leaving the chat (and, before the sidebar moved into the
 * layout, losing it) to change one dropdown.
 *
 * `header` rather than `title`: `title` alone renders the top bar on mobile
 * only, so on desktop this opened with no heading at all and a close button
 * floating unanchored over the content. `header` renders the same
 * `OverlayHeader` row on both breakpoints.
 *
 * `size="md"` (36rem) rather than `auto` (which stretches to 48rem): the
 * content is one select, one stepper and a link, and letting it run to
 * 768px left long measures of help text and a lot of empty space. There is
 * no view-switching inside to guard against resizing, so a content-driven
 * height is fine.
 */
export function WardenSettingsDialog({
  open,
  onClose,
  visibleModels,
  defaultModelKey,
}: {
  open: boolean;
  onClose: () => void;
  visibleModels: DiscoveredModel[];
  defaultModelKey: string | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} header="Settings" title="Settings" size="md">
      <GeneralSettings visibleModels={visibleModels} defaultModelKey={defaultModelKey} />
    </Dialog>
  );
}
