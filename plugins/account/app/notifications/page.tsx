'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@sovereignfs/ui';
import styles from '../account.module.css';
import notifStyles from './notifications.module.css';

interface NotificationPrefs {
  mutedCategories: string[];
  pollIntervalSecs: number;
}

interface PushState {
  pushEnabled: boolean;
  subscribed: boolean;
  publicKey: string | null;
}

const KNOWN_CATEGORIES = [
  { id: 'info', label: 'Info', description: 'General informational notifications from plugins.' },
  {
    id: 'announcement',
    label: 'Announcements',
    description: 'Platform-wide messages from admins.',
  },
];

const POLL_OPTIONS = [
  { value: 15, label: 'Every 15 seconds' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every minute' },
];

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushWorking, setPushWorking] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [prefsRes, pushRes] = await Promise.all([
      fetch('/api/account/notification-prefs', { credentials: 'same-origin' }),
      fetch('/api/account/push-subscription', { credentials: 'same-origin' }),
    ]);
    if (prefsRes.ok) {
      const data = (await prefsRes.json()) as { prefs: NotificationPrefs };
      setPrefs(data.prefs);
    }
    if (pushRes.ok) {
      setPush((await pushRes.json()) as PushState);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (updated: Partial<NotificationPrefs>) => {
    setSaving(true);
    const res = await fetch('/api/account/notification-prefs', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const data = (await res.json()) as { prefs: NotificationPrefs };
      setPrefs(data.prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const toggleMute = (category: string) => {
    if (!prefs) return;
    const muted = prefs.mutedCategories.includes(category)
      ? prefs.mutedCategories.filter((c) => c !== category)
      : [...prefs.mutedCategories, category];
    void save({ mutedCategories: muted });
  };

  const subscribePush = async () => {
    if (!push?.publicKey) return;
    setPushWorking(true);
    setPushError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushError('Notification permission denied.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(push.publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch('/api/account/push-subscription', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (res.ok) {
        setPush((prev) => prev && { ...prev, subscribed: true });
      } else {
        setPushError('Could not save subscription — please try again.');
      }
    } catch (err: unknown) {
      setPushError(err instanceof Error ? err.message : 'Subscription failed.');
    } finally {
      setPushWorking(false);
    }
  };

  const unsubscribePush = async () => {
    setPushWorking(true);
    setPushError(null);
    try {
      // Unsubscribe at the browser level first.
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      await sub?.unsubscribe();
      // Remove from server.
      await fetch('/api/account/push-subscription', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      setPush((prev) => prev && { ...prev, subscribed: false });
    } catch {
      setPushError('Unsubscribe failed — please try again.');
    } finally {
      setPushWorking(false);
    }
  };

  if (!prefs)
    return (
      <div className={styles.sections}>
        <p>Loading…</p>
      </div>
    );

  const pushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  return (
    <div className={styles.sections}>
      {/* Push notifications section ─────────────────────────────────────── */}
      {push?.pushEnabled && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Push notifications</h2>
          {!pushSupported ? (
            <p className={styles.help}>
              Push notifications are not supported in this browser. Install the app or use a
              supported browser to enable them.
            </p>
          ) : push.subscribed ? (
            <>
              <p className={styles.help}>
                Push notifications are <strong>enabled</strong> on this device. You will receive
                notifications even when the app is not open.
              </p>
              <Button
                variant="secondary"
                onClick={() => void unsubscribePush()}
                disabled={pushWorking}
              >
                {pushWorking ? 'Working…' : 'Disable push on this device'}
              </Button>
            </>
          ) : (
            <>
              <p className={styles.help}>
                Enable push notifications to receive alerts even when the app is not open. Your
                browser will ask for permission.
              </p>
              {typeof window !== 'undefined' &&
                window.location.protocol !== 'https:' &&
                window.location.hostname !== 'localhost' && (
                  <p className={notifStyles.pushWarning}>
                    Push notifications require HTTPS. They will not work on this connection.
                  </p>
                )}
              <Button onClick={() => void subscribePush()} disabled={pushWorking}>
                {pushWorking ? 'Working…' : 'Enable push notifications'}
              </Button>
            </>
          )}
          {pushError && (
            <p className={notifStyles.pushError} role="alert">
              {pushError}
            </p>
          )}
        </section>
      )}

      {/* Muted categories ─────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Muted categories</h2>
        <p className={styles.help}>
          Muted categories are silently discarded — you will not see toasts or bell badges for them.
          The <strong>security</strong> category cannot be muted.
        </p>
        <ul className={notifStyles.categoryList}>
          {KNOWN_CATEGORIES.map((cat) => (
            <li key={cat.id} className={notifStyles.categoryItem}>
              <input
                id={`mute-${cat.id}`}
                type="checkbox"
                checked={prefs.mutedCategories.includes(cat.id)}
                onChange={() => toggleMute(cat.id)}
                disabled={saving}
                className={notifStyles.checkbox}
              />
              <label htmlFor={`mute-${cat.id}`} className={notifStyles.categoryLabel}>
                {cat.label}
                <span className={notifStyles.categoryDesc}> — {cat.description}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {/* Poll interval ────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Poll interval</h2>
        <p className={styles.help}>How often the browser checks for new notifications.</p>
        <select
          className={notifStyles.select}
          value={prefs.pollIntervalSecs}
          onChange={(e) => void save({ pollIntervalSecs: Number(e.target.value) })}
          disabled={saving}
          aria-label="Notification poll interval"
        >
          {POLL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {saved && (
          <p className={notifStyles.savedMsg} role="status">
            Saved.
          </p>
        )}
      </section>
    </div>
  );
}

/** Convert a base64url VAPID public key to the Uint8Array that the browser expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
