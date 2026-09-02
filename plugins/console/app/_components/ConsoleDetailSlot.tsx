'use client';

import type { ReactNode } from 'react';
import { useConsoleDetailPane } from '../_lib/detail-pane';

/**
 * Registers `children` as `ConsoleLayout`'s 3rd (detail) column and renders
 * nothing itself — the actual content appears in the layout's own
 * `ThreeColumnLayout`, not here. Lets a Server Component page (e.g.
 * `users/page.tsx`) hand off a client detail pane without the page itself
 * needing a `'use client'` directive.
 *
 * `detailKey` (typically the selected row's id) is required — see
 * `useConsoleDetailPane`'s doc comment for why a `key` prop on `children`
 * itself can't do this job.
 */
export function ConsoleDetailSlot({
  detailKey,
  children,
}: {
  detailKey: string;
  children: ReactNode;
}) {
  useConsoleDetailPane(children, detailKey);
  return null;
}
