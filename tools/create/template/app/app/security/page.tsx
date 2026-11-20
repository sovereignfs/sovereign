import { listSessions } from '@sovereignfs/auth/server';
import { requireSignedIn } from '@/lib/session';
import { signIn, signInSettings } from '@/lib/sign-in';
import { ButtonLink, PageHeader } from '../ui';
import { Password, Sessions } from './panels';

export const dynamic = 'force-dynamic';

/** A person's password and sessions (auth.md §7). An account that signs in through core has no password here: core is its way in. */
export default async function SecurityPage() {
  const session = await requireSignedIn('/security');
  const { auth, database } = await signIn();
  const ctx = await auth.$context;
  const accounts = await ctx.internalAdapter.findAccounts(session.user.id);
  const hasPassword = accounts.some((account) => account.providerId === 'credential');
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
      <Sessions sessions={sessions} />
    </main>
  );
}
