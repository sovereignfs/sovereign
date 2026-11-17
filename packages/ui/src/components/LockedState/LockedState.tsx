import type { ReactNode } from 'react';
import { EmptyState } from '../EmptyState/EmptyState';

/**
 * Why a place is locked: `locked` — this browser is not unlocked yet; `removed` — the person who shared it stopped sharing it.
 */
export type LockedReason = 'locked' | 'removed';

export interface LockedStateProps {
  reason: LockedReason;
  /** The app's own name, as people know it: "Notes". */
  appName: string;
  /** For `removed`: who stopped sharing, if the app knows. */
  sharedBy?: string;
  /**
   * The one way forward, made by the consumer: for `locked`, a `ButtonLink` to unlock (the SDK takes the person to core and back);
   * for `removed`, a way back to the app's list. This package knows no router and no core, so it builds neither.
   */
  action?: ReactNode;
  className?: string;
}

/**
 * LockedState — what an encrypted app shows where it cannot open something (core-app §5.9): never ciphertext, never nothing.
 * Built on `EmptyState`. While the app is still finding out whether it can open the place, it renders nothing rather than this, so
 * the locked state never flashes on a page about to open. Presentational and RSC-safe.
 */
export function LockedState({ reason, appName, sharedBy, action, className }: LockedStateProps) {
  if (reason === 'removed') {
    return (
      <EmptyState
        icon="user-x"
        heading="You no longer have access"
        description={
          sharedBy
            ? `${sharedBy} stopped sharing this with you. Ask them if you still need it.`
            : 'This is no longer shared with you. Ask the person who shared it if you still need it.'
        }
        action={action}
        className={className}
      />
    );
  }
  return (
    <EmptyState
      icon="lock"
      heading="Unlock to see this"
      description={`${appName} keeps this encrypted, so only you and the people you share it with can read it. Unlock with your password or a passkey to open it on this browser.`}
      action={action}
      className={className}
    />
  );
}
