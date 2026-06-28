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
  try {
    const res = await fetch(`${SELF_URL}/api/account/prefs`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[preferences] prefs fetch failed: ${res.status}`);
      return { timezone: 'UTC', theme: 'system', sidebarPlugins: null };
    }
    return res.json() as Promise<Prefs>;
  } catch (err) {
    console.error('[preferences] prefs fetch error:', err instanceof Error ? err.message : err);
    return { timezone: 'UTC', theme: 'system', sidebarPlugins: null };
  }
}

async function getSidebarData(): Promise<SidebarData> {
  const cookie = (await headers()).get('cookie') ?? '';
  try {
    const res = await fetch(`${SELF_URL}/api/account/sidebar-plugins`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[preferences] sidebar-plugins fetch failed: ${res.status}`);
      return { plugins: [], sidebarPlugins: null };
    }
    return res.json() as Promise<SidebarData>;
  } catch (err) {
    console.error(
      '[preferences] sidebar-plugins fetch error:',
      err instanceof Error ? err.message : err,
    );
    return { plugins: [], sidebarPlugins: null };
  }
}

export default async function PreferencesPage() {
  const [prefs, sidebarData] = await Promise.all([getPrefs(), getSidebarData()]);

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Appearance</h2>
        <div className={styles.controlGroup}>
          <ThemeControl value={prefs.theme} />
          <p className={styles.help}>Applies immediately and to every session on this device.</p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Language &amp; Region</h2>
        <div className={styles.field} style={{ maxWidth: 400 }}>
          <label className={styles.label} htmlFor="lang-select">
            Language
          </label>
          <select id="lang-select" className={styles.select} defaultValue="en-US" disabled>
            <option value="en-US">English (US)</option>
          </select>
        </div>
        <div className={styles.field} style={{ maxWidth: 400 }}>
          <label className={styles.label} htmlFor="tz-select">
            Timezone
          </label>
          <TimezoneSelect id="tz-select" value={prefs.timezone} />
          <p className={styles.help}>Used for date and time display across the platform.</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sidebar</h2>
          <p className={styles.help}>
            Drag to reorder plugin icons. Toggle to show or hide individual plugins. The home icon
            and platform controls are always visible.
          </p>
        </div>
        <div style={{ maxWidth: 400, width: '100%' }}>
          <SidebarControl plugins={sidebarData.plugins} initial={sidebarData.sidebarPlugins} />
        </div>
      </section>
    </div>
  );
}
