import { headers } from 'next/headers';
import { TimezoneSelect } from '../_components/TimezoneSelect';
import { ThemeControl } from '../_components/ThemeControl';
import { SidebarControl } from '../_components/SidebarControl';
import styles from '../account.module.css';

export const dynamic = 'force-dynamic';

const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

interface Prefs {
  timezone: string;
  theme: string;
  sidebarPlugins: Array<{ id: string; hidden: boolean }> | null;
}

interface PluginInfo {
  id: string;
  name: string;
  iconUrl?: string;
}

interface SidebarData {
  plugins: PluginInfo[];
  sidebarPlugins: Array<{ id: string; hidden: boolean }> | null;
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

async function getSidebarData(): Promise<SidebarData> {
  const cookie = (await headers()).get('cookie') ?? '';
  const res = await fetch(`${SELF_URL}/api/account/sidebar-plugins`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load sidebar plugins: ${res.status}`);
  return res.json() as Promise<SidebarData>;
}

export default async function PreferencesPage() {
  const [prefs, sidebarData] = await Promise.all([getPrefs(), getSidebarData()]);

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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sidebar</h2>
        <p className={styles.help}>
          Drag to reorder plugin icons. Toggle to show or hide individual plugins. The home icon and
          platform controls are always visible.
        </p>
        <SidebarControl plugins={sidebarData.plugins} initial={sidebarData.sidebarPlugins} />
      </section>
    </div>
  );
}
