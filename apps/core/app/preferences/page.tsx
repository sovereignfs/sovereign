import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { getSession } from '../../src/auth/session';
import { getMailForAppsService } from '../../src/mail';
import { getNotificationService } from '../../src/notifications';
import { localeOptions, timezoneOptions } from '../../src/preferences/options';
import styles from '../security/security.module.css';
import { AppearanceChoice } from './appearance-choice';
import { EmailSettings } from './email-settings';
import { NotificationSettings } from './notification-settings';
import { PreferencesPanel } from './preferences-panel';

export const metadata: Metadata = { title: 'Preferences' };

export default async function PreferencesPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Fpreferences');

  const { timezone, locale } = session.user;
  const apps = await (await getNotificationService()).apps(session.user.id);
  // Email from apps has a place here only while the instance can send it, and when an app the person uses can (core-app §4.2).
  const mail = await getMailForAppsService();
  const emailApps = (await mail.available()) ? await mail.apps(session.user.id) : [];
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
        <NotificationSettings apps={apps} />
        {emailApps.length > 0 ? <EmailSettings apps={emailApps} /> : null}
      </div>
    </Card>
  );
}
