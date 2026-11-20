'use client';

import { useId, type ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import { IOS_INSTALL_STEPS } from '../InstallPrompt/InstallPrompt';
import { Toggle } from '../Toggle/Toggle';
import styles from './PushControl.module.css';

/**
 * What a device can do about notifications from an app, as `usePush` in `@sovereignfs/pwa/client` reports it:
 * - `checking`: not known yet (the server and the first render). Nothing is shown.
 * - `unavailable`: the app sends no notifications (its server has no key). Nothing is shown.
 * - `unsupported`, `insecure`, `install-first`, `blocked`: why this device can't have them, and what to do.
 * - `off` / `on`: the switch.
 */
export type PushControlState =
  | 'checking'
  | 'unavailable'
  | 'unsupported'
  | 'insecure'
  | 'install-first'
  | 'blocked'
  | 'off'
  | 'on';

export interface PushControlProps {
  /** The app's name, as people know it. */
  appName: string;
  state: PushControlState;
  /** Turning on or off is under way: the switch is busy. */
  working?: boolean;
  /** Why turning on or off didn't work, shown beside the switch. */
  error?: string | null;
  onTurnOn: () => void;
  onTurnOff: () => void;
  /** More for when it is on or off, such as a button that sends a test notification. */
  children?: ReactNode;
  className?: string;
}

/**
 * PushControl — "Notifications on this device", for an app's settings (RFC 0009 §3). It says plainly what this device can do and
 * offers one switch. Framework-agnostic: the state and the two actions come from the app (`usePush`).
 */
export function PushControl({
  appName,
  state,
  working = false,
  error,
  onTurnOn,
  onTurnOff,
  children,
  className,
}: PushControlProps) {
  const descriptionId = useId();
  const errorId = useId();
  if (state === 'checking' || state === 'unavailable') return null;

  let content: ReactNode;
  if (state === 'off' || state === 'on') {
    content = (
      <>
        <div className={styles.row}>
          <p id={descriptionId} className={styles.text}>
            Get notifications from {appName} on this device, even when it isn’t open.
          </p>
          <Toggle
            checked={state === 'on'}
            disabled={working}
            aria-busy={working || undefined}
            aria-label={`Notifications from ${appName} on this device`}
            aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
            onChange={(checked) => (checked ? onTurnOn() : onTurnOff())}
          />
        </div>
        {error ? (
          <p id={errorId} role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        {children ? <div className={styles.extra}>{children}</div> : null}
      </>
    );
  } else {
    const words: Record<typeof state, string> = {
      unsupported: `This browser can’t show notifications from ${appName}.`,
      insecure: 'Notifications need a secure (https) connection.',
      'install-first': `To get notifications on this iPhone, add ${appName} to your Home Screen first: ${IOS_INSTALL_STEPS}`,
      blocked: `Notifications are blocked for ${appName} in this browser’s settings.`,
    };
    content = (
      <p className={styles.note}>
        {state === 'install-first' ? (
          <span className={styles.icon} aria-hidden>
            <Icon name="smartphone" size="sm" aria-hidden />
          </span>
        ) : null}
        <span>{words[state]}</span>
      </p>
    );
  }

  return (
    <section
      aria-label="Notifications on this device"
      className={[styles.control, className].filter(Boolean).join(' ')}
    >
      <p className={styles.title}>Notifications on this device</p>
      {content}
    </section>
  );
}
