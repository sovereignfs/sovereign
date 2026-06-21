import { headers } from 'next/headers';
import { TimezoneSelect } from '../_components/TimezoneSelect';
import { ThemeControl } from '../_components/ThemeControl';
import styles from '../account.module.css';

export const dynamic = 'force-dynamic';

const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

interface Prefs {
  timezone: string;
  theme: string;
}

async function getPrefs(): Promise<Prefs> {
  const cookie = (await headers()).get('cookie') ?? '';
  const res = await fetch(`${SELF_URL}/api/account/prefs`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load preferences: ${res.status}`);
  return res.json() as Promise<Prefs>;
}

export default async function PreferencesPage() {
  const prefs = await getPrefs();

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Appearance</h2>
        <ThemeControl value={prefs.theme} />
        <p className={styles.help}>Applies immediately and to every session on this device.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Timezone</h2>
        <TimezoneSelect value={prefs.timezone} />
        <p className={styles.help}>Used for date and time display across the platform.</p>
      </section>
    </div>
  );
}
