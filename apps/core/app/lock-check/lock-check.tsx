'use client';

import { useEffect, useState } from 'react';
import { Button } from '@sovereignfs/ui';
import styles from './lock-check.module.css';
import {
  appendLog,
  backgroundEntry,
  clearLog,
  environment,
  isArmed,
  makePasskey,
  markHidden,
  readLog,
  report,
  setArmed,
  testPasskeyId,
  unlock,
  type Entry,
} from './checks';

/** Set once this page load has written what it found, so an effect run twice (as React does in development) writes it once. */
let loadLogged = false;

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * The lock check's page (task 4.15). Everything it learns is written to a log kept in this browser, so it survives the device ending the
 * app, and is copied out as text to send. Nothing is sent to a server.
 */
export function LockCheck({ rpId }: { rpId: string }) {
  const [log, setLog] = useState<Entry[]>([]);
  const [armed, setArmedState] = useState(false);
  const [hasTestPasskey, setHasTestPasskey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const add = (entries: readonly Entry[]) => {
    let next: Entry[] = readLog(storage());
    for (const entry of entries) next = appendLog(storage(), entry);
    setLog(next);
  };

  useEffect(() => {
    const store = storage();
    setLog(readLog(store));
    setArmedState(isArmed(store));
    setHasTestPasskey(testPasskeyId(store) !== null);
    void (async () => {
      if (loadLogged) return;
      loadLogged = true;
      const found: Entry[] = await environment(Date.now());
      const away = backgroundEntry(store, 'load', Date.now());
      if (away) found.push(away);
      add(found);
      // Armed: ask with no tap as soon as the page opens, which is what a lock would do on opening.
      if (isArmed(store)) {
        add([await unlock(store, rpId, testPasskeyId(store) ? 'test' : 'core', 'no tap')]);
      }
    })();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markHidden(storage(), Date.now());
        return;
      }
      const back = backgroundEntry(storage(), 'shown', Date.now());
      if (back) add([back]);
      if (isArmed(storage())) {
        void unlock(storage(), rpId, testPasskeyId(storage()) ? 'test' : 'core', 'no tap').then(
          (entry) => add([entry]),
        );
      }
    };
    const onPageHide = (event: PageTransitionEvent) =>
      add([
        {
          at: Date.now(),
          check: 'pagehide',
          outcome: 'info',
          detail: event.persisted ? 'kept in the back/forward cache' : 'not kept',
        },
      ]);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
    // The listeners are set once for the life of the page; `add` reads and writes the stored log, not this render's.
  }, [rpId]);

  const run = async (step: () => Promise<Entry>) => {
    setBusy(true);
    add([await step()]);
    setHasTestPasskey(testPasskeyId(storage()) !== null);
    setBusy(false);
  };

  const toggleArmed = () => {
    setArmed(storage(), !armed);
    setArmedState(!armed);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report(log, navigator.userAgent));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Lock check</h1>
      <p className={styles.text}>
        Tries what a biometric lock would need on this device. Install core to the home screen and
        open it from there, then go through the steps. Nothing is sent anywhere: copy the results at
        the end and send them.
      </p>

      <ol className={styles.steps}>
        <li>
          <p className={styles.text}>
            Make a passkey here. It is kept by this device only, signs in to nothing, and is named
            “Lock check”: delete it from the device’s passwords afterwards.
          </p>
          <Button disabled={busy} onClick={() => void run(() => makePasskey(storage(), rpId))}>
            Make a test passkey
          </Button>
        </li>
        <li>
          <p className={styles.text}>Ask for it with a tap, as a lock screen’s button would.</p>
          <div className={styles.row}>
            <Button
              disabled={busy || !hasTestPasskey}
              onClick={() => void run(() => unlock(storage(), rpId, 'test', 'tap'))}
            >
              Unlock with the test passkey
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => unlock(storage(), rpId, 'core', 'tap'))}
            >
              Unlock with my passkey for core
            </Button>
          </div>
        </li>
        <li>
          <p className={styles.text}>
            Ask with no tap: armed, this page asks as soon as it opens and each time the app comes
            back. Arm it, leave the app for a while, come back, and note whether a prompt appeared.
            Then leave it for longer (ten minutes, then an hour) to see whether the device ends the
            app.
          </p>
          <Button variant="secondary" onClick={toggleArmed}>
            {armed ? 'Disarm' : 'Arm: ask with no tap'}
          </Button>
        </li>
      </ol>

      <h2 className={styles.heading}>Results</h2>
      {log.length === 0 ? (
        <p className={styles.text}>Nothing yet.</p>
      ) : (
        <ul className={styles.log} aria-label="Results">
          {log.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className={styles[entry.outcome]}>
              <span className={styles.check}>{entry.check}</span> {entry.detail}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.row}>
        <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy results'}</Button>
        <Button
          variant="secondary"
          onClick={() => {
            clearLog(storage());
            setLog([]);
            setCopied(false);
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
