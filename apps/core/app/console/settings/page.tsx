import type { Metadata } from 'next';
import { Alert } from '@sovereignfs/ui';
import { BrandingStore } from '../../../src/branding/store';
import { getFieldCipher } from '../../../src/config';
import { requireConsole } from '../../../src/console/guard';
import { getDatabase } from '../../../src/database';
import { describeInstance } from '../../../src/instance/describe';
import { getMailService } from '../../../src/mail';
import { can } from '../../../src/roles/capabilities';
import { getCapabilityMatrix } from '../../../src/roles/matrix';
import { getSettings } from '../../../src/settings';
import { NameForm } from './name-form';
import { Pictures } from './pictures';
import { RegistrationForm } from './registration-form';
import styles from './settings.module.css';
import { SmtpForm } from './smtp-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { session } = await requireConsole('instance:view', { returnTo: '/console/settings' });
  const matrix = await getCapabilityMatrix();
  const canConfigure = can(session.user.role, 'instance:configure', matrix);
  const canSeeMail = can(session.user.role, 'instance:configure-secrets', matrix);

  const [database, settings, mail] = await Promise.all([
    getDatabase(),
    getSettings(),
    getMailService().then((service) => service.status()),
  ]);
  const instance = await describeInstance(settings, new BrandingStore(database), {
    withMail: canSeeMail,
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>
      <p className={styles.lead}>
        How this instance looks and who can join it.
        {canConfigure ? '' : ' You can look at these settings, but not change them.'}
      </p>

      <section className={styles.section} aria-labelledby="name-heading">
        <h2 id="name-heading" className={styles.subheading}>
          Name
        </h2>
        <NameForm
          name={instance.name.value ?? 'Sovereign'}
          source={instance.name.source}
          canEdit={canConfigure}
        />
      </section>

      <section className={styles.section} aria-labelledby="pictures-heading">
        <h2 id="pictures-heading" className={styles.subheading}>
          Logo and favicon
        </h2>
        <Pictures
          canEdit={canConfigure}
          images={{
            'logo-light': instance.images['logo-light']?.path,
            'logo-dark': instance.images['logo-dark']?.path,
            favicon: instance.images.favicon?.path,
          }}
        />
      </section>

      <section className={styles.section} aria-labelledby="sign-up-heading">
        <h2 id="sign-up-heading" className={styles.subheading}>
          Sign-up
        </h2>
        <RegistrationForm
          inviteOnly={instance.inviteOnly.value ?? true}
          source={instance.inviteOnly.source}
          canEdit={canConfigure}
        />
      </section>

      <section className={styles.section} aria-labelledby="email-heading">
        <h2 id="email-heading" className={styles.subheading}>
          Email
        </h2>
        {mail.state === 'configured' ? (
          <Alert variant="success">Email is set up. Sign-in links and invitations are sent.</Alert>
        ) : (
          <Alert variant="warning">
            Email is not set up, so nothing that needs it can be sent: {mail.reasons.join('; ')}.
          </Alert>
        )}
        {instance.smtp ? (
          <SmtpForm smtp={instance.smtp} encryptionReady={getFieldCipher() !== undefined} />
        ) : (
          <p className={styles.hint}>Only the owner can see or change how email is sent.</p>
        )}
      </section>
    </div>
  );
}
