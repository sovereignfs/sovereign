import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { getSession } from '../../src/auth/session';
import { localeOptions, timezoneOptions } from '../../src/preferences/options';
import styles from '../security/security.module.css';
import { AppearanceChoice } from './appearance-choice';
import { PreferencesPanel } from './preferences-panel';

export const metadata: Metadata = { title: 'Preferences' };

export default async function PreferencesPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Fpreferences');

  const { timezone, locale } = session.user;
  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Preferences</h1>
        <AppearanceChoice />
        <PreferencesPanel
          timezone={timezone ?? ''}
          locale={locale ?? ''}
          timezones={timezoneOptions(timezone)}
          locales={localeOptions(locale)}
        />
      </div>
    </Card>
  );
}
