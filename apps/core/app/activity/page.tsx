import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Button, Card, EmptyState, FormField, Select } from '@sovereignfs/ui';
import { getActivityService } from '../../src/activity';
import { getSession } from '../../src/auth/session';
import styles from '../security/security.module.css';
import listStyles from './activity.module.css';
import { ActivityList, type ActivityRow } from './activity-list';

export const metadata: Metadata = { title: 'Activity' };

/** A time in the person's own zone (or UTC, until they set one), written out so the page and the browser agree. */
function writtenOut(time: number, timeZone: string | null | undefined): string {
  const format = (zone: string | undefined) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone ?? 'UTC',
    }).format(time);
  try {
    return format(timeZone ?? undefined);
  } catch {
    return format(undefined);
  }
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Factivity');
  const service = await getActivityService();
  // The account is the session's, never a name in the request.
  const everyApp = await service.apps(session.user.id);
  const asked = (await searchParams).app;
  // An app that has recorded nothing about this person is not one to filter by: the page shows everything.
  const scope = everyApp.find((app) => app.clientId === (Array.isArray(asked) ? asked[0] : asked));
  const entries = await service.list(session.user.id, scope ? { clientId: scope.clientId } : {});
  const rows: ActivityRow[] = entries.map((entry) => ({
    id: entry.id,
    appName: entry.appName,
    summary: entry.summary,
    link: entry.link,
    when: writtenOut(entry.at, session.user.timezone),
  }));

  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Activity</h1>
        <p className={styles.text}>
          What the apps you use have noted about what they did for you. Only you can read this: not
          the people who run this instance, and not the apps. Entries go after 90 days, and you can
          delete them sooner.
        </p>
        {everyApp.length > 1 ? (
          <form method="get" className={listStyles.filter}>
            <FormField label="App">
              {(field) => (
                <Select {...field} name="app" defaultValue={scope?.clientId ?? ''}>
                  <option value="">All apps</option>
                  {everyApp.map((app) => (
                    <option key={app.clientId} value={app.clientId}>
                      {app.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <Button type="submit" variant="secondary">
              Show
            </Button>
          </form>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            icon="history"
            heading="Nothing to show yet"
            description="When an app you use notes something it did for you, it appears here."
          />
        ) : (
          <ActivityList
            entries={rows}
            scope={scope ? { clientId: scope.clientId, name: scope.name } : undefined}
          />
        )}
      </div>
    </Card>
  );
}
