'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';
import styles from './InstallPrompt.module.css';

/** How to add a site to the Home Screen on an iPhone or iPad, which has no install prompt: one sentence, shared with `PushControl`. */
export const IOS_INSTALL_STEPS = 'tap Share, then Add to Home Screen.';

/** What a device lets a page do about installing it. */
export type InstallKind = 'prompt' | 'ios';

export interface InstallHintProps {
  /** The name the installed app will have. */
  appName: string;
  /**
   * `prompt`: the browser has its own install prompt, which **Install** opens. `ios`: Safari on an iPhone or iPad,
   * which has none, so the hint says how (Share, then Add to Home Screen).
   */
  kind: InstallKind;
  /** Called by **Install** (only for `prompt`). */
  onInstall?: () => void;
  /** Called by **Not now**. */
  onDismiss: () => void;
  className?: string;
}

/**
 * InstallHint — says that this site can be installed as an app, and how. The presentation only: `InstallPrompt`
 * decides whether to show it.
 */
export function InstallHint({ appName, kind, onInstall, onDismiss, className }: InstallHintProps) {
  return (
    <section
      aria-label={`Install ${appName}`}
      className={[styles.hint, className].filter(Boolean).join(' ')}
    >
      <span className={styles.icon} aria-hidden>
        <Icon name={kind === 'ios' ? 'smartphone' : 'download'} size="md" aria-hidden />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>Install {appName}</p>
        <p className={styles.text}>
          {kind === 'ios'
            ? `Open it from your Home Screen, in a window of its own: ${IOS_INSTALL_STEPS}`
            : 'Open it from your home screen or app list, in a window of its own.'}
        </p>
      </div>
      <div className={styles.actions}>
        {kind === 'prompt' ? (
          <Button size="sm" onClick={onInstall}>
            Install
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </section>
  );
}

/** The event Chromium fires when a site may be installed; not in the DOM's own types. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Whether the page is already running as an installed app. Read only in an effect or a handler. */
export function isInstalledDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    standalone ||
    ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(
      (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
    )
  );
}

/** An iPhone or iPad (an iPad says it is a Mac, with touch). Read only in an effect or a handler. */
function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // A browser that keeps nothing asks again next time; nothing else depends on it.
  }
}

export interface UseInstallPrompt {
  /** What can be offered now, or `null` when nothing should be shown. */
  kind: InstallKind | null;
  install(): Promise<void>;
  dismiss(): void;
}

/**
 * useInstallPrompt — whether to offer installing this site, decided on the device: nothing in an installed window,
 * nothing once dismissed (kept on this device only), the browser's prompt where it offers one, words for iPhone and
 * iPad Safari. Starts as `null` on the server and on the first render, so the markup is the same for everyone.
 */
export function useInstallPrompt(storageKey = 'sv-install-dismissed'): UseInstallPrompt {
  const [kind, setKind] = useState<InstallKind | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isInstalledDisplay() || readDismissed(storageKey)) return;
    if (isAppleMobile()) setKind('ios');
    const offered = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setKind('prompt');
    };
    const installed = () => {
      setDeferred(null);
      setKind(null);
    };
    window.addEventListener('beforeinstallprompt', offered);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', offered);
      window.removeEventListener('appinstalled', installed);
    };
  }, [storageKey]);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The browser's prompt can be shown once; after it, the hint goes either way.
    setDeferred(null);
    setKind(null);
    if (outcome === 'dismissed') writeDismissed(storageKey);
  }, [deferred, storageKey]);

  const dismiss = useCallback(() => {
    writeDismissed(storageKey);
    setKind(null);
  }, [storageKey]);

  return { kind, install, dismiss };
}

export interface InstallPromptProps {
  appName: string;
  /** Where a dismissal is remembered on the device. */
  storageKey?: string;
  className?: string;
}

/**
 * InstallPrompt — offers to install this site as an app where the device allows it, and renders nothing anywhere
 * else (an installed window, a browser with no install, a dismissed hint).
 */
export function InstallPrompt({ appName, storageKey, className }: InstallPromptProps) {
  const { kind, install, dismiss } = useInstallPrompt(storageKey);
  if (!kind) return null;
  return (
    <InstallHint
      appName={appName}
      kind={kind}
      onInstall={() => void install()}
      onDismiss={dismiss}
      {...(className ? { className } : {})}
    />
  );
}
