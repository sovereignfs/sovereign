'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ExportPanel as SharedExportPanel, type ExportPanelStatus } from '@sovereignfs/ui';
import { signInValue } from '../src/auth/derive';

export type ExportActionResult = { ok: true } | { ok: false; error: string };

/**
 * Core's use of the design system's `ExportPanel` (core-app §4.7.3): the password goes as the value the browser derives (core-app §5.2),
 * the export is started by core's own action, downloaded from `/api/exports/{id}`, and the page looks again with `router.refresh()`.
 */
export function ExportPanel({
  view,
  address,
  kind,
  action,
  timeZone,
  disabledReason,
  confirmTitle,
  confirmMessage,
  startLabel,
}: {
  view: ExportPanelStatus;
  address: string;
  kind: 'instance' | 'person';
  action: (previous: ExportActionResult | null, form: FormData) => Promise<ExportActionResult>;
  timeZone?: string | null;
  disabledReason?: string;
  confirmTitle: string;
  confirmMessage: string;
  startLabel: string;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const start = useCallback(
    async (password: string): Promise<ExportActionResult> => {
      let value: string;
      try {
        value = await signInValue(password, address);
      } catch {
        return { ok: false, error: 'This page could not get ready. Reload it and try again.' };
      }
      const form = new FormData();
      form.set('password', value);
      return action(null, form);
    },
    [action, address],
  );
  return (
    <SharedExportPanel
      status={view}
      onStart={start}
      downloadAction={(id) => `/api/exports/${encodeURIComponent(id)}?kind=${kind}`}
      onRefresh={refresh}
      {...(disabledReason ? { disabledReason } : {})}
      confirmTitle={confirmTitle}
      confirmMessage={confirmMessage}
      startLabel={startLabel}
      {...(timeZone ? { timeZone } : {})}
    />
  );
}
