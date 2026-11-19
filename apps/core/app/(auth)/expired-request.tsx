import { ButtonLink } from '@sovereignfs/ui';
import { AuthNotice } from './auth-notice';
import styles from './auth.module.css';

/**
 * What a sign-in page shows when the app's signed request has expired (`isExpiredRequest`): the page was open longer than the ten
 * minutes the provider allows, so the app's sign-in starts again from `restartAt`, its own request to the authorization endpoint
 * (`resumeAddress`). Nothing the person typed was used.
 */
export function ExpiredRequest({ restartAt }: { restartAt: string }) {
  return (
    <div className={styles.form}>
      <AuthNotice tone="warning">
        This sign-in waited too long, so it has to start again. Nothing you entered was used.
      </AuthNotice>
      <ButtonLink href={restartAt} className={styles.wide}>
        Start again
      </ButtonLink>
    </div>
  );
}
