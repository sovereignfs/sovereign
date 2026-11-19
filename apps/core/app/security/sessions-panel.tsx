'use client';

import { SessionsPanel as Panel } from '@sovereignfs/ui';
import type { SessionSummary } from '../../src/sessions/sessions';
import { endOtherSessionsAction, endSessionAction } from './actions';

/** The person's open sessions: the design system's panel, with core's actions, which check the capability themselves. */
export function SessionsPanel({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <Panel sessions={sessions} endSession={endSessionAction} endOthers={endOtherSessionsAction} />
  );
}
