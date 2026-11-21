'use client';

import { SessionsPanel as Panel } from '@sovereignfs/ui';
import type { SessionSummary } from '../../src/sessions/sessions';
import { endOtherSessionsAction, endSessionAction } from './actions';

/**
 * The person's open sessions: the design system's panel, with core's actions, which check the capability themselves. Times are in the
 * person's own zone (UTC until they set one), written the same on the server and in the browser.
 */
export function SessionsPanel({
  sessions,
  timeZone,
}: {
  sessions: SessionSummary[];
  timeZone?: string | null | undefined;
}) {
  return (
    <Panel
      sessions={sessions}
      endSession={endSessionAction}
      endOthers={endOtherSessionsAction}
      {...(timeZone ? { timeZone } : {})}
    />
  );
}
