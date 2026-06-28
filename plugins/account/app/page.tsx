import { redirect } from 'next/navigation';

const VALID_TABS = new Set([
  'profile',
  'security',
  'preferences',
  'notifications',
  'billing',
  'data',
  'activity',
]);

/**
 * Root of the account overlay. The AccountMenu links here with a `?tab=` param
 * to request a specific sub-page (e.g. `/account?tab=preferences`). Going
 * through the root first ensures the `(.)account` intercepting-route layout is
 * initialised in the client router tree before navigating to the sub-page —
 * a direct soft-nav to `/account/preferences` cold-starts the intercepting
 * route and can fail in Next.js 15 App Router.
 */
export default async function AccountIndex({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  if (tab && VALID_TABS.has(tab)) {
    redirect(`/account/${tab}`);
  }
  redirect('/account/profile');
}
