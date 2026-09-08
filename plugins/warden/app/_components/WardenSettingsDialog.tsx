'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog, Spinner } from '@sovereignfs/ui';
import { loadGeneralSettingsAction } from '../actions';
import type { GeneralSettingsData } from '../actions';
import { GeneralSettings } from './GeneralSettings';
import styles from './settings.module.css';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: GeneralSettingsData }
  | { kind: 'error'; message: string };

/**
 * Warden's General settings, in a dialog rather than a page.
 *
 * What's left here after Providers and Models became their own destinations
 * in the main column is small and self-contained — a default model, a
 * retention action, and a link to the account-wide export. A whole route
 * for that meant leaving the chat (and, before the sidebar moved into the
 * layout, losing it) to change one dropdown.
 *
 * Its data loads when the dialog opens, not up front. It used to arrive as
 * props from the `(chat)` layout, which had two costs: the layout had to
 * await a live model-discovery pass before the sidebar could paint at all,
 * and — because a layout is not re-run on navigation within it — the model
 * list went stale the moment the user toggled a model on the Models page
 * and came back to open Settings. Fetching on open fixes both.
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
export function WardenSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} header="Settings" title="Settings" size="md">
      {/* `Dialog` mounts its children only while open, so this component's
          fetch effect runs on every open and nothing runs while closed. */}
      <SettingsContent />
    </Dialog>
  );
}

function SettingsContent() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    void loadGeneralSettingsAction().then((result) => {
      if (cancelled) return;
      setState(
        result.ok ? { kind: 'ready', data: result.data } : { kind: 'error', message: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.kind === 'loading') {
    return (
      <div className={styles.loadingState}>
        <Spinner label="Loading settings…" />
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className={styles.loadingState} role="alert">
        <p className={`${styles.feedbackText} ${styles.feedbackTextError}`}>{state.message}</p>
        <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <GeneralSettings
      visibleModels={state.data.visibleModels}
      defaultModelKey={state.data.defaultModelKey}
    />
  );
}
