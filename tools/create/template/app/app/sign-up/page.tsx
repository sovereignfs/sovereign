import { describePasswordPolicy, safeReturnTo } from '@sovereignfs/auth';
import { sendOnIfSignedIn } from '@/lib/session';
import { signIn, signInSettings, waysIn } from '@/lib/sign-in';
import { AuthCard, AuthFooter, AuthLink, AuthNotice, BrandBadge } from '../ui';
import { SignUpPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  await sendOnIfSignedIn(returnTo);
  const ways = waysIn();
  const { database } = await signIn();
  const first = (await database.run('SELECT 1 AS found FROM users LIMIT 1')).rows.length === 0;
  const open = ways.local && (ways.signUp === 'open' || first);
  const policy = signInSettings().passwordPolicy;
  return (
    <main>
      <AuthCard brand={<BrandBadge name="__TITLE__" />} title="Create your account" legal={false}>
        {open ? (
          <SignUpPanel returnTo={returnTo} policy={policy} hint={describePasswordPolicy(policy)} />
        ) : (
          <>
            <AuthNotice tone="warning">Making an account here is closed.</AuthNotice>
            <AuthFooter>
              <AuthLink href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
                Back to sign in
              </AuthLink>
            </AuthFooter>
          </>
        )}
      </AuthCard>
    </main>
  );
}
