import { listSessions } from '@sovereignfs/auth/server';
import { requireSignedIn } from '@/lib/session';
import { signIn, signInSettings, waysIn } from '@/lib/sign-in';
import { ButtonLink, PageHeader } from '../ui';
import { LinkSovereign, Password, Sessions } from './panels';

export const dynamic = 'force-dynamic';

/** How a link to core came back, as the callback says in the address (auth.md §8.2). */
const OUTCOMES = ['done', 'taken', 'address'] as const;

/** A person's password and sessions (auth.md §7). An account that signs in through core has no password here: core is its way in.
 * One with a password may link itself to core (auth.md §8.2). */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSignedIn('/security');
  const { auth, database } = await signIn();
  const ctx = await auth.$context;
  const accounts = await ctx.internalAdapter.findAccounts(session.user.id);
  const hasPassword = accounts.some((account) => account.providerId === 'credential');
  const linked = accounts.some((account) => account.providerId === 'sovereign');
  const link = (await searchParams).link;
  const outcome = OUTCOMES.find((each) => each === link);
  const sessions = await listSessions(database, session.user.id, session.session.id);
  return (
    <main>
      <PageHeader
        title="Security"
        action={
          <ButtonLink href="/" variant="secondary">
            Back
          </ButtonLink>
        }
      />
      {hasPassword ? (
        <Password address={session.user.email} policy={signInSettings().passwordPolicy} />
      ) : null}
      {/* An account of the app's own may also sign in through core, once linked by the person (auth.md §8.2). */}
      {waysIn().core && hasPassword ? (
        <LinkSovereign address={session.user.email} linked={linked} outcome={outcome} />
      ) : null}
      <Sessions sessions={sessions} />
    </main>
  );
}
