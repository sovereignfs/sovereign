import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { resolveInstanceName } from '@/src/instance-name';
import { readServerSession } from '@/src/server-session';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  // Already signed in? Send them to the app rather than showing the form. The
  // middleware skips this route, so the check lives here (see readServerSession).
  if (await readServerSession()) redirect('/');

  // Read server-side rather than leaving this to LoginForm's own
  // `useSearchParams()` call. That distinction matters specifically for
  // `middleware.ts`'s unauthenticated-GET **rewrite** to this page (bare `/`,
  // and an `installable` plugin's bare routePrefix, RFC 0081): a rewrite
  // never changes the browser's visible address bar, so a *client* hook
  // reading `window.location` sees no query string at all — verified live,
  // not assumed: an unauthenticated GET to an installable plugin's route
  // landed post-login at `/` instead of back in the plugin's scope until this
  // was fixed. This Server Component instead receives `searchParams` from
  // the request Next actually resolved (the rewrite target), which does
  // carry `returnUrl` correctly. The ordinary 303-redirect case (any other
  // gated route) already puts `returnUrl` on the real, visible URL, so this
  // works identically there too — one source of truth for both paths.
  const { returnUrl } = await searchParams;

  const instanceName = resolveInstanceName(process.env.INSTANCE_NAME);
  return (
    <Suspense>
      <LoginForm
        instanceName={instanceName}
        instanceInitial={instanceName[0]?.toUpperCase() ?? 'S'}
        returnUrl={returnUrl ?? null}
      />
    </Suspense>
  );
}
