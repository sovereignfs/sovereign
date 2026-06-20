'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../account.module.css';
import notifStyles from './notifications.module.css';

interface NotificationPrefs {
  mutedCategories: string[];
  pollIntervalSecs: number;
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/account/notification-prefs', { credentials: 'same-origin' });
    if (res.ok) {
      const data = (await res.json()) as { prefs: NotificationPrefs };
      setPrefs(data.prefs);
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

  if (!prefs)
    return (
      <div className={styles.sections}>
        <p>Loading…</p>
      </div>
    );

  return (
    <div className={styles.sections}>
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
