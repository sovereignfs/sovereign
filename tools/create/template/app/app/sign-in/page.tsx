import { redirect } from 'next/navigation';
import { safeReturnTo } from '@sovereignfs/auth';
import { sendOnIfSignedIn } from '@/lib/session';
import { signIn, waysIn } from '@/lib/sign-in';
import { AuthCard, BrandBadge } from '../ui';
import { SignInPanel } from './panel';

export const dynamic = 'force-dynamic';

/** What a sign-in through core that did not work comes back with (auth.md §8), in words a person can act on. */
const PROBLEMS: Record<string, string> = {
  sovereign: 'Signing in through Sovereign did not work. Try again.',
  sovereign_email: 'Sovereign did not share your email address, which this app needs.',
  sovereign_refused: 'This account cannot sign in here.',
  account_not_linked:
    'An account of this app already has that email address. Sign in with its password instead.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  await sendOnIfSignedIn(returnTo);
  const ways = waysIn();
  const error = typeof query.error === 'string' ? PROBLEMS[query.error] : undefined;
  // With core the only way in, there is nothing to choose: the person goes on to core, and comes back here only with a problem to show.
  if (!ways.local && ways.core && error === undefined && query.error === undefined) {
    redirect(`/api/auth/sign-in/sovereign?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const { database } = await signIn();
  // Sign-up is open, or closed to everyone but the first account (auth.md §5).
  const first = (await database.run('SELECT 1 AS found FROM users LIMIT 1')).rows.length === 0;
  return (
    <main>
      <AuthCard brand={<BrandBadge name="__TITLE__" />} title="Sign in to __TITLE__" legal={false}>
        <SignInPanel
          returnTo={returnTo}
          local={ways.local}
          core={ways.core !== undefined}
          signUp={ways.local && (ways.signUp === 'open' || first)}
          problem={error}
        />
      </AuthCard>
    </main>
  );
}
