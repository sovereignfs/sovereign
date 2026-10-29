import type { Metadata } from 'next';
import Link from 'next/link';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { redirect } from 'next/navigation';
import { Card, PageContainer } from '@sovereignfs/ui';
import { getAuth, getAuthSettings } from '../../src/auth';
import { getSession } from '../../src/auth/session';
import { readConsentRequest } from '../../src/oauth/consent';
import { queryOf, signedQueryOf } from '../../src/oauth/signed-query';
import styles from '../(auth)/auth.module.css';
import { ConsentForm } from './consent-form';

export const metadata: Metadata = { title: 'Allow access' };

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = queryOf(await searchParams);
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(`/consent?${query}`)}`);

  const auth = await getAuth();
  const request = await readConsentRequest(signedQueryOf(query), {
    verify: (signed) => verifyOAuthQueryParams(signed, getAuthSettings().secret),
    findClient: (clientId) =>
      auth.$context.then((context) =>
        context.adapter.findOne({
          model: 'oauthClient',
          where: [{ field: 'clientId', value: clientId }],
        }),
      ),
  });

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          {request ? (
            <>
              <h1 className={styles.title}>Allow access to your account?</h1>
              <ConsentForm
                appName={request.appName}
                returnHost={request.returnHost}
                email={session.user.email}
                permissions={request.permissions}
                scopes={request.scopes}
              />
            </>
          ) : (
            <>
              <h1 className={styles.title}>This request has expired</h1>
              <p className={styles.lead}>
                Go back to the app and sign in again. If this keeps happening, tell whoever runs
                this instance.
              </p>
              <p className={styles.footer}>
                <Link className={styles.link} href="/">
                  Back to the home page
                </Link>
              </p>
            </>
          )}
        </div>
      </Card>
    </PageContainer>
  );
}
